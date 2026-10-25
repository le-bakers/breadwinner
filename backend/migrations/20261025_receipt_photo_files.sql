-- Run once in the Supabase SQL Editor (it is also section 7 of database.sql, safe to run again).
-- Moves receipt photos out of the database: each photo becomes a small JPEG file in a private
-- Storage bucket, and receipts.photo only remembers the file's path ("<user id>/<receipt id>.jpg").
-- Receipts saved before this still hold a whole picture in "photo"; they keep working, and the
-- website moves each one to a file the next time that receipt is saved ("not valid" below).

alter table public.receipts drop constraint if exists receipts_photo_check;
alter table public.receipts add constraint receipts_photo_check check (length(photo) <= 200) not valid;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipt-photos', 'receipt-photos', false, 500000, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = 500000, allowed_mime_types = array['image/jpeg'];

drop policy if exists "read own receipt photos" on storage.objects;
drop policy if exists "add own receipt photos" on storage.objects;
drop policy if exists "change own receipt photos" on storage.objects;
drop policy if exists "delete own receipt photos" on storage.objects;
create policy "read own receipt photos" on storage.objects for select to authenticated
  using (bucket_id = 'receipt-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "add own receipt photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipt-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "change own receipt photos" on storage.objects for update to authenticated
  using (bucket_id = 'receipt-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'receipt-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "delete own receipt photos" on storage.objects for delete to authenticated
  using (bucket_id = 'receipt-photos' and (storage.foldername(name))[1] = auth.uid()::text);
