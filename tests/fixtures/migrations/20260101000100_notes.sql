-- Uses what a hosted Supabase project has before its first migration:
-- the auth schema, auth.uid() and the anon and authenticated roles.
create table public.notes (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.notes enable row level security;

create policy notes_owner_read on public.notes
  for select to authenticated
  using (owner_id = auth.uid());

grant select on public.notes to authenticated;
