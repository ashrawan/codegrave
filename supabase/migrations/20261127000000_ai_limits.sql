-- Create with AI: an allowance of its own for one account. Without a row an
-- account gets the function's default (AI_DAILY, 20 a day). Rows are written
-- by hand in the database; only the Edge Function reads them, with the
-- service role, so nobody can raise their own.
create table public.ai_limits (
  owner uuid primary key references public.profiles (id) on delete cascade,
  daily integer not null check (daily >= 0),
  note text
);
alter table public.ai_limits enable row level security;
