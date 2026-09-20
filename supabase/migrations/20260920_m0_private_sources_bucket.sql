insert into storage.buckets (id, name, public)
values ('sources', 'sources', false)
on conflict (id) do nothing;

create policy "sources_bucket_select_own"
on storage.objects for select
using (bucket_id = 'sources' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "sources_bucket_insert_own"
on storage.objects for insert
with check (bucket_id = 'sources' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "sources_bucket_delete_own"
on storage.objects for delete
using (bucket_id = 'sources' and (storage.foldername(name))[1] = auth.uid()::text);
