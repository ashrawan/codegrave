-- The limits of an account, on its own row like `ai_daily`, so each can be changed without new code
-- (asked for, Nov 2026: "in the future, we can make it configurable"; free use must stay within a small,
-- known cost even with many accounts). `stripe-webhook` sets them by plan; one account can be changed by hand.
--   publish_max     how many timelines it may have published at once (each with a voiceover keeps one MP3)
--   voice_monthly   how many characters a month the server voice may say for it
-- Accounts may still write only their username, so they cannot raise their own limits.
alter table public.profiles add column publish_max integer not null default 10 check (publish_max >= 0);
alter table public.profiles add column voice_monthly integer not null default 5000 check (voice_monthly >= 0);
update public.profiles set publish_max = 1000, voice_monthly = 500000 where plan = 'pro';

-- Publishing past the limit is refused here, so no way round the page gets past it.
create function public.publish_cap() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n integer; most integer;
begin
  if new.visibility = 'private' or (tg_op = 'UPDATE' and old.visibility <> 'private') then return new; end if;
  select p.publish_max into most from public.profiles p where p.id = new.owner;
  select count(*) into n from public.timelines t where t.owner = new.owner and t.visibility <> 'private' and t.id <> new.id;
  if n >= coalesce(most, 10) then
    raise exception 'You can have % timelines published at once. Make one private or delete one first, or go Pro.', coalesce(most, 10) using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger publish_cap before insert or update of visibility on public.timelines
  for each row execute function public.publish_cap();
