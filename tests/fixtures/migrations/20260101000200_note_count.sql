create function public.note_count()
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*) from public.notes
$$;

revoke execute on function public.note_count() from public, anon;
grant execute on function public.note_count() to authenticated;
