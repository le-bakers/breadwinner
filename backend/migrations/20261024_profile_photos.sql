-- Run in the Supabase SQL Editor before using cloud profile photos.
-- Photos are stored separately from auth metadata so they do not enlarge login tokens.
create table if not exists public.profile_photos (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  photo text not null check (length(photo) <= 150000 and photo ~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$')
);

alter table public.profile_photos enable row level security;
revoke all on public.profile_photos from anon;
grant select, insert, update, delete on public.profile_photos to authenticated;

drop policy if exists "read own profile photo" on public.profile_photos;
drop policy if exists "add own profile photo" on public.profile_photos;
drop policy if exists "change own profile photo" on public.profile_photos;
drop policy if exists "delete own profile photo" on public.profile_photos;
create policy "read own profile photo" on public.profile_photos for select to authenticated using (user_id = auth.uid());
create policy "add own profile photo" on public.profile_photos for insert to authenticated with check (user_id = auth.uid());
create policy "change own profile photo" on public.profile_photos for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own profile photo" on public.profile_photos for delete to authenticated using (user_id = auth.uid());
