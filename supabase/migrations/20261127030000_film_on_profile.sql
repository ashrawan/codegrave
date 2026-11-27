-- Film mode (docs/FILM_MODE.md) has no key: it opens for the account signed in, when that account
-- has been switched on for it. The switch is one field on the account's own row, off for everyone
-- until it is set by hand. An account may write only its username (see the grants on profiles),
-- so nobody can switch it on for themselves. The log of the key check that this replaces goes.
alter table public.profiles add column film boolean not null default false;
drop table if exists public.film_log;
