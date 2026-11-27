-- Film mode (docs/FILM_MODE.md): every call of the function "film-auth" is written here, and the
-- function counts the last minute's rows to limit how often it may be called. Only the service
-- role, which the function uses, may read or write it: row level security is on with no policy.
create table public.film_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  ip text,
  what text not null,          -- 'key', 'open', 'generate'
  ok boolean not null,
  detail text                  -- what was opened; for 'generate', the prompt
);
create index film_log_recent on public.film_log (what, at desc);
alter table public.film_log enable row level security;
revoke all on public.film_log from anon, authenticated;
