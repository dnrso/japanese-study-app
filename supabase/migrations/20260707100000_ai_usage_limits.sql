create table if not exists public.ai_usage (
  user_id     uuid not null references auth.users(id) on delete cascade,
  usage_date  date not null,
  request_count integer not null default 0,
  last_request_at timestamptz,
  primary key (user_id, usage_date)
);
alter table public.ai_usage enable row level security;
-- no user-facing policies: only the service role (edge function) touches this table
