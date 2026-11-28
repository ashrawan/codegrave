-- Server voice (docs/ACCOUNTS.md, "The pro plan"): for a pro account the function `voiceover` has a
-- hosted voice say a line, and that is paid for by the character. So there is a most a month for each
-- account, counted here: one row per account and month, and one function that adds to it only while
-- the total stays within the most, in a single statement, so two requests at once cannot both slip
-- past. Only the server (the service key) may call it; an account may read its own count.
create table public.speech_use (
  owner uuid not null references auth.users (id) on delete cascade,
  month date not null,
  chars integer not null default 0 check (chars >= 0),
  primary key (owner, month)
);
alter table public.speech_use enable row level security;
create policy "own speech use" on public.speech_use for select to authenticated using (owner = (select auth.uid()));
revoke insert, update, delete on public.speech_use from anon, authenticated;

-- Adds `n` characters to this month's count and answers the new total, or -1 (and adds nothing) when
-- that would pass `most`. A negative `n` gives back what a failed request had taken.
create function public.speech_add(who uuid, n integer, most integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare total integer;
begin
  if n > most then return -1; end if;
  insert into public.speech_use as u (owner, month, chars)
    values (who, date_trunc('month', now() at time zone 'utc')::date, greatest(n, 0))
    on conflict (owner, month) do update set chars = greatest(u.chars + n, 0) where u.chars + n <= most
    returning chars into total;
  return coalesce(total, -1);
end $$;
revoke execute on function public.speech_add(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.speech_add(uuid, integer, integer) to service_role;
