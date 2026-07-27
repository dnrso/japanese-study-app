-- Atomic check-and-increment for the per-user AI analysis rate limits.
--
-- The edge function (supabase/functions/analyze-sentence/index.ts) used to
-- SELECT request_count, compare it in JS, then blind-write count + 1. That is
-- a TOCTOU race: N concurrent requests all read the same count, all pass the
-- check, and all write the same value, so 100 parallel calls were recorded as
-- 1. This function collapses the check and the increment into ONE statement so
-- Postgres' own row locking serialises concurrent callers.
--
-- Semantics preserved from the old JS code:
--   * the minute check is evaluated BEFORE the daily check (a caller who is
--     both over the daily cap and inside the cooldown gets 'rate-limited-minute')
--   * the minute check compares "now" against ai_usage.last_request_at
--   * every accepted attempt is counted BEFORE Gemini is called, so failed and
--     retried attempts still consume quota
-- Difference: "now" is the DATABASE clock (clock_timestamp()), not the client
-- clock, so a caller can no longer influence the cooldown window.

create or replace function public.consume_ai_usage(
  p_user_id uuid,
  p_usage_date date,
  p_daily_limit int,
  p_rate_limit_ms int
)
returns table (
  allowed boolean,
  reason text,
  request_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now        timestamptz := clock_timestamp();
  v_cooldown   interval    := p_rate_limit_ms * interval '1 millisecond';
  v_count      integer;
  v_last       timestamptz;
begin
  -- Single-statement check-and-increment.
  --
  -- Why this is atomic:
  --   * If the row does not exist, the INSERT wins the unique index on
  --     (user_id, usage_date); every other concurrent caller conflicts and
  --     falls into the DO UPDATE branch instead of also inserting.
  --   * INSERT ... ON CONFLICT DO UPDATE takes a row-level lock on the
  --     conflicting row before evaluating the DO UPDATE ... WHERE clause, and
  --     re-reads the *latest committed* version of that row. Concurrent
  --     callers therefore queue on the lock and each one evaluates the guard
  --     against the count/timestamp the previous winner just committed.
  --   * Because the guard and the `request_count + 1` live in the same
  --     statement, there is no window between "read" and "write" for another
  --     request to slip through, and the increment is relative to the stored
  --     value rather than to a value the client read earlier.
  --   * When the guard is false the row is left untouched and RETURNING
  --     produces no row, which is how we detect "denied".
  insert into public.ai_usage as u (user_id, usage_date, request_count, last_request_at)
  values (p_user_id, p_usage_date, 1, v_now)
  on conflict (user_id, usage_date) do update
     set request_count   = u.request_count + 1,
         last_request_at = v_now
   where u.request_count < p_daily_limit
     and (u.last_request_at is null or v_now - u.last_request_at >= v_cooldown)
  returning u.request_count into v_count;

  if v_count is not null then
    return query select true, ''::text, v_count;
    return;
  end if;

  -- Guard rejected the write: re-read the row to classify why. The row is
  -- guaranteed to exist here (the INSERT only conflicts against an existing
  -- row) and is guaranteed to be the committed state of whichever caller we
  -- queued behind.
  select u.request_count, u.last_request_at
    into v_count, v_last
    from public.ai_usage u
   where u.user_id = p_user_id
     and u.usage_date = p_usage_date;

  v_count := coalesce(v_count, 0);

  if v_last is not null and v_now - v_last < v_cooldown then
    return query select false, 'rate-limited-minute'::text, v_count;
  elsif v_count >= p_daily_limit then
    return query select false, 'rate-limited-daily'::text, v_count;
  else
    -- Should be unreachable; only possible if the row changed again between
    -- the upsert and this read. Deny conservatively rather than granting a
    -- free request.
    return query select false, 'rate-limited-minute'::text, v_count;
  end if;
end;
$$;

comment on function public.consume_ai_usage(uuid, date, int, int) is
  'Atomically records one AI analysis request for (user_id, usage_date) and enforces the per-minute cooldown and daily cap. Returns allowed/reason/request_count. Service role only.';

-- analyze-sentence/index.ts calls this with the SERVICE ROLE client only, and
-- the function is `security definer` (runs as the owner, bypassing ai_usage's
-- RLS). It must therefore not be reachable by end users, who could otherwise
-- burn another user's quota or their own.
revoke all on function public.consume_ai_usage(uuid, date, int, int) from public;
revoke all on function public.consume_ai_usage(uuid, date, int, int) from anon, authenticated;
grant execute on function public.consume_ai_usage(uuid, date, int, int) to service_role;
