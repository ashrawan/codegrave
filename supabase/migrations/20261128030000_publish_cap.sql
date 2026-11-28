-- How many timelines a free account may have published at once (asked for, Nov 2026: free use must stay
-- within a small known cost, "even if 100 users use, our $10 should be enough"). Each published timeline
-- with a voiceover keeps one MP3 in the store, so this also caps what a free account keeps there. A pro
-- account has no cap. Checked in the database, so no way round the page gets past it.
create function public.publish_cap() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if new.visibility = 'private' or (tg_op = 'UPDATE' and old.visibility <> 'private') then return new; end if;
  if exists (select 1 from public.profiles p where p.id = new.owner and p.plan = 'pro') then return new; end if;
  select count(*) into n from public.timelines t where t.owner = new.owner and t.visibility <> 'private' and t.id <> new.id;
  if n >= 10 then
    raise exception 'A free account can have 10 timelines published at once. Make one private first, or go Pro.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger publish_cap before insert or update of visibility on public.timelines
  for each row execute function public.publish_cap();
