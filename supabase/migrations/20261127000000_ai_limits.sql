-- Create with AI: an allowance of its own for one account. Without a row an
-- account gets the function's default (AI_DAILY, 20 a day). Rows are written
-- by hand in the database; nobody can write their own.
create table public.ai_limits (
  owner uuid primary key references public.profiles (id) on delete cascade,
  daily integer not null check (daily >= 0),
  note text
);
alter table public.ai_limits enable row level security;
-- An account may read its own number, so the page can say how many requests are left.
create policy "own ai limit" on public.ai_limits for select to authenticated using (owner = (select auth.uid()));
