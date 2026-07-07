create table if not exists public.study_snapshots (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  snapshot   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.study_snapshots enable row level security;

create policy "own snapshot select" on public.study_snapshots
  for select using (auth.uid() = user_id);
create policy "own snapshot insert" on public.study_snapshots
  for insert with check (auth.uid() = user_id);
create policy "own snapshot update" on public.study_snapshots
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own snapshot delete" on public.study_snapshots
  for delete using (auth.uid() = user_id);
