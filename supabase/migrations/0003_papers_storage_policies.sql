-- Storage policies for the 'papers' bucket. A public bucket grants public READ,
-- but writes (upload/update/delete) are denied until a policy permits them — which
-- is why dashboard uploads hit "new row violates row-level security policy".
-- Single-team model: any authenticated user manages papers; anyone may read
-- (public reproducibility goal).

create policy "papers public read"
  on storage.objects for select
  using (bucket_id = 'papers');

create policy "papers authed insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'papers');

create policy "papers authed update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'papers')
  with check (bucket_id = 'papers');

create policy "papers authed delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'papers');
