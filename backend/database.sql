-- BreadWinner database (Supabase)
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- Safe to run more than once.
--
-- Supabase already gives us sign-in: every account is a row in auth.users
-- (email, hashed password, Google link). We never store passwords ourselves.
-- This file adds the one table we need on top of that: receipts.


-- ============ 1. The receipts table ============
-- One row per scanned receipt. The items on it live in "lines" as a JSON list,
-- the same shape the website already uses, so a receipt saves and loads in one step.
create table if not exists public.receipts (
  id           uuid primary key default gen_random_uuid(),
  -- whose receipt this is. Deleting the account deletes their receipts too (on delete cascade).
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  store_name   text not null default 'Captured Receipt',
  receipt_date date not null,                                        -- the day of the purchase
  subtotal     numeric(10, 2) check (subtotal >= 0),                 -- printed on the receipt, or empty
  extra_cost   numeric(10, 2) not null default 0 check (extra_cost >= 0),  -- the gluten-free extra cost on this receipt
  photo        text check (length(photo) <= 200),                    -- where the receipt's small photo file is kept (section 7), e.g. "<user id>/<receipt id>.jpg"
  lines        jsonb not null default '[]' check (jsonb_typeof(lines) = 'array'),  -- the items
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Makes "show me my receipts, newest first" fast even with thousands of rows
create index if not exists receipts_user_date on public.receipts (user_id, receipt_date desc);


-- ============ 2. Privacy: everyone sees only their own receipts ============
-- Row Level Security (RLS) is a rule the database itself checks on every request.
-- auth.uid() is the id of whoever is signed in. If the row's user_id doesn't match, the row is invisible.
-- The website's public key cannot get around this.
alter table public.receipts enable row level security;

drop policy if exists "read own receipts" on public.receipts;
drop policy if exists "add own receipts" on public.receipts;
drop policy if exists "change own receipts" on public.receipts;
drop policy if exists "delete own receipts" on public.receipts;

create policy "read own receipts"   on public.receipts for select to authenticated using (user_id = auth.uid());
create policy "add own receipts"    on public.receipts for insert to authenticated with check (user_id = auth.uid());
create policy "change own receipts" on public.receipts for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own receipts" on public.receipts for delete to authenticated using (user_id = auth.uid());


-- ============ 3. Keep updated_at correct ============
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists receipts_touch on public.receipts;
create trigger receipts_touch before update on public.receipts
  for each row execute function public.touch_updated_at();


-- ============ 4. Totals per tax year ============
-- The number a user brings to tax time: extra cost added up per year.
-- security_invoker = the privacy rules above still apply, so you only ever see your own totals.
create or replace view public.yearly_totals with (security_invoker = true) as
  select
    user_id,
    extract(year from receipt_date)::int as tax_year,
    count(*)                             as receipts,
    sum(extra_cost)                      as extra_cost
  from public.receipts
  group by user_id, tax_year;


-- ============ 5. "Delete my account" button ============
-- The website can't delete an account by itself (on purpose), so this function does it
-- for the signed-in person only. Their receipts go with it (on delete cascade above).
-- security definer = runs with the database owner's permission, but only ever touches auth.uid().
create or replace function public.delete_my_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;


-- ============ 6. Private cloud profile photos ============
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


-- ============ 7. Receipt photos (files, not database rows) ============
-- The photo itself is a small JPEG file in Supabase Storage. The receipts table only remembers its path.
-- This keeps the database small, and a huge or broken upload can't fill it.
-- The bucket is private (public = false): a photo opens only through a temporary link made for its owner.
-- The bucket itself refuses anything over 500 KB or anything that isn't a JPEG (a real photo here is about 50 KB).
-- The same check as section 1, but photo paths are short. "not valid" = old receipts that still hold a whole
-- picture in "photo" are left alone; the website moves each one to a file the next time it is saved.
alter table public.receipts drop constraint if exists receipts_photo_check;
alter table public.receipts add constraint receipts_photo_check check (length(photo) <= 200) not valid;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipt-photos', 'receipt-photos', false, 500000, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = 500000, allowed_mime_types = array['image/jpeg'];

-- Files live in a folder named after their owner's id, so "my folder" is what the rules below check.
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
