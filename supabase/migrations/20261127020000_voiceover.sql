-- Voiceover: a timeline told aloud (supabase/functions/voiceover, site/voice.js).

-- A voiceover is a request of its own kind, counted against the same daily allowance.
alter table public.ai_requests drop constraint ai_requests_kind_check;
alter table public.ai_requests add constraint ai_requests_kind_check check (kind in ('create', 'change', 'voice'));

-- The clips: small MP3 files, one a line, read by anyone who can open the timeline and written only by
-- their owner, each account inside the folder named by its own id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voice', 'voice', true, 1048576, array['audio/mpeg'])
on conflict (id) do nothing;

create policy "own voice clips insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'voice' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own voice clips select" on storage.objects for select to authenticated
  using (bucket_id = 'voice' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own voice clips delete" on storage.objects for delete to authenticated
  using (bucket_id = 'voice' and (storage.foldername(name))[1] = (select auth.uid())::text);
