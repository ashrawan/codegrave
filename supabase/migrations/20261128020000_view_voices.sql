-- Default voiceovers of built views (docs/VIEWS.md, "A default voiceover"): the words of each, kept here as
-- text, one row a view, with a note of where its sound is. The sound itself is one file a view and voice in
-- the public store (Cloudflare R2), never here. `script` is what the file under voices/ in the repository
-- holds: { style, lines: [{ id, text }] }, the ids being intro, the entry ids and outro. `audio`, once the
-- sound is made, is { voice, v, secs, cues: [[start, end], ...] }: one pair of seconds for each line, in order.
-- Anyone may read; only the server (the service key) writes.
create table public.view_voices (
  owner text not null,
  view text not null,
  script jsonb not null,
  audio jsonb,
  updated_at timestamptz not null default now(),
  primary key (owner, view)
);
alter table public.view_voices enable row level security;
create policy "anyone reads view voices" on public.view_voices for select to anon, authenticated using (true);
revoke insert, update, delete on public.view_voices from anon, authenticated;

-- Keys for the function `voice-store`, which puts a default voiceover's sound in the store: only the hash of
-- a key is kept, with the day it stops working. No policy: only the server reads it.
create table public.admin_keys (
  hash text primary key,
  note text,
  expires_at timestamptz not null
);
alter table public.admin_keys enable row level security;
revoke all on public.admin_keys from anon, authenticated;
