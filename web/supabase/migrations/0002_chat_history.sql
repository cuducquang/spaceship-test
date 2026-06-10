-- Spaceship — chat history (run after 0001_init.sql, same open demo policies)

create table if not exists public.conversations (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null default 'New conversation',
  model               text not null default 'claude-opus-4-8',
  summary             text,
  compacted_until     integer not null default 0,
  total_input_tokens  bigint not null default 0,
  total_output_tokens bigint not null default 0,
  last_context_tokens integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  idx             integer not null,
  role            text not null check (role in ('user','assistant')),
  content         text not null default '',
  segments        jsonb,
  created_at      timestamptz not null default now(),
  unique (conversation_id, idx)
);

create index if not exists messages_conversation_idx on public.messages (conversation_id, idx);
create index if not exists conversations_updated_idx on public.conversations (updated_at desc);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "conversations_open_demo" on public.conversations;
create policy "conversations_open_demo" on public.conversations
  for all using (true) with check (true);

drop policy if exists "messages_open_demo" on public.messages;
create policy "messages_open_demo" on public.messages
  for all using (true) with check (true);
