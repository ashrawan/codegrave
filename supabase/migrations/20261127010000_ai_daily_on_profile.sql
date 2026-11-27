-- Create with AI: the day's allowance is one number on the account's own row,
-- `profiles.ai_daily` (20 unless changed). It replaces the table `ai_limits`,
-- so the function reads the allowance with the row it already has by its key.
-- To give one account more, change the number on its row (by hand for now,
-- by the payment webhook later).
alter table public.profiles add column ai_daily integer not null default 20 check (ai_daily >= 0);
drop table public.ai_limits;

-- An account may write only its username: never its own allowance.
revoke insert, update on public.profiles from anon, authenticated;
grant insert (id, username), update (username) on public.profiles to authenticated;
