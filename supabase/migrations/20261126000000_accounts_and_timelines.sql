-- Phase 1: a profile per account (one username for now) and the timelines people make.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique,
  created_at timestamptz not null default now(),
  constraint username_shape check (username is null or username ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'),
  constraint username_free check (username is null or username not in (
    'wiki','classical','t','data','media','api','auth','admin','new','create','explore','search','settings',
    'login','signin','signup','account','about','help','terms','privacy','print','static','assets','codegrave','www','me','draft','drafts'))
);

create table public.timelines (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  slug text not null,
  title text not null,
  description text not null default '',
  visibility text not null default 'private' check (visibility in ('private','link','public')),
  entries integer not null default 0,
  forked_from text,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint slug_shape check (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  constraint title_size check (char_length(title) between 1 and 120),
  constraint description_size check (char_length(description) <= 600),
  constraint data_size check (pg_column_size(data) <= 3000000),
  unique (owner, slug)
);
create index timelines_owner on public.timelines (owner, updated_at desc);

alter table public.profiles enable row level security;
alter table public.timelines enable row level security;

-- Usernames are public (they are in addresses). Each account writes only its own row.
create policy "profiles are readable" on public.profiles for select using (true);
create policy "own profile insert" on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy "own profile update" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Public timelines are readable by everyone; the rest only by their owner.
-- "link" timelines are read through open_timeline(), so they cannot be listed.
create policy "public or own timelines" on public.timelines for select using (visibility = 'public' or owner = (select auth.uid()));
create policy "own timelines insert" on public.timelines for insert to authenticated with check (owner = (select auth.uid()));
create policy "own timelines update" on public.timelines for update to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy "own timelines delete" on public.timelines for delete to authenticated using (owner = (select auth.uid()));

-- A profile row for every new account.
create function public.new_account() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger new_account after insert on auth.users for each row execute function public.new_account();

create function public.touch() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  new.entries = coalesce(jsonb_array_length(new.data -> 'entries'), 0);
  return new;
end $$;
create trigger touch before insert or update on public.timelines for each row execute function public.touch();

-- A free account keeps at most 50 timelines.
create function public.timeline_cap() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.timelines where owner = new.owner) >= 50 then
    raise exception 'You have reached the limit of 50 timelines.';
  end if;
  return new;
end $$;
create trigger timeline_cap before insert on public.timelines for each row execute function public.timeline_cap();

-- One timeline, by its id or by username and slug: public and link ones for anyone, private ones for their owner.
create function public.open_timeline(p_id uuid default null, p_username text default null, p_slug text default null)
returns table (id uuid, username text, slug text, title text, description text, visibility text, mine boolean, updated_at timestamptz, data jsonb)
language sql stable security definer set search_path = '' as $$
  select t.id, p.username, t.slug, t.title, t.description, t.visibility, coalesce(t.owner = (select auth.uid()), false), t.updated_at, t.data
  from public.timelines t join public.profiles p on p.id = t.owner
  where ((p_id is not null and t.id = p_id) or (p_id is null and p.username = p_username and t.slug = p_slug))
    and (t.owner = (select auth.uid()) or t.visibility = 'public' or (t.visibility = 'link' and p_id is not null))
  limit 1
$$;
revoke all on function public.open_timeline(uuid, text, text) from public;
grant execute on function public.open_timeline(uuid, text, text) to anon, authenticated;
revoke all on function public.new_account() from public, anon, authenticated;
revoke all on function public.timeline_cap() from public, anon, authenticated;
