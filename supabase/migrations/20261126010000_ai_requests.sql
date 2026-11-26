-- Create with AI: one row per request, written by the Edge Function
-- `ai-timeline` with the service role. It counts a day's allowance per
-- account and records what each request cost. Readers see only their own.
create table public.ai_requests (
  id bigint generated always as identity primary key,
  owner uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  model text not null,
  kind text not null check (kind in ('create', 'change')),
  prompt text not null check (char_length(prompt) <= 600),
  ok boolean not null default false,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0
);
create index ai_requests_owner_day on public.ai_requests (owner, created_at desc);
alter table public.ai_requests enable row level security;
create policy "own ai requests" on public.ai_requests for select to authenticated using (owner = (select auth.uid()));
