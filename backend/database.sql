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
  photo        text check (length(photo) < 300000),                  -- small photo of the receipt (about 50 KB)
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
alter table public.receipts force row level security;
revoke all on public.receipts from public, anon;
revoke all on public.receipts from authenticated;
grant select, insert, update, delete on public.receipts to authenticated;

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

-- ============ 6. Versioned consent, including existing Google accounts ============
-- Kept separately from editable user metadata. Rows are append-only (no UPDATE).
create table if not exists public.account_consents (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  terms_version text not null check (terms_version = '2026-10-22'),
  health_version text not null check (health_version = '2026-10-22'),
  adult_confirmed boolean not null check (adult_confirmed is true),
  health_processing boolean not null check (health_processing is true),
  accepted_at timestamptz not null default now(),
  primary key (user_id, terms_version, health_version)
);
alter table public.account_consents enable row level security;
alter table public.account_consents force row level security;
revoke all on public.account_consents from public, anon, authenticated;
grant select, delete on public.account_consents to authenticated;
-- Server supplies identity and timestamp; clients cannot backdate acceptance.
grant insert (terms_version, health_version, adult_confirmed, health_processing)
  on public.account_consents to authenticated;
drop policy if exists "read own consent" on public.account_consents;
drop policy if exists "record own consent" on public.account_consents;
drop policy if exists "withdraw own consent" on public.account_consents;
create policy "read own consent" on public.account_consents for select to authenticated
  using (user_id = (select auth.uid()));
create policy "record own consent" on public.account_consents for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "withdraw own consent" on public.account_consents for delete to authenticated
  using (user_id = (select auth.uid()));

-- Bound data accepted through the public REST API, even when clients bypass the UI.
-- NOT VALID avoids breaking existing accounts; constraints still protect new/changed rows.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'receipts_payload_bounds'
                 and conrelid = 'public.receipts'::regclass) then
    alter table public.receipts add constraint receipts_payload_bounds check (
      length(store_name) <= 200 and jsonb_array_length(lines) <= 300
      and octet_length(lines::text) <= 500000
      and subtotal between 0 and 999999.99 and extra_cost between 0 and 999999.99
      and (photo is null or photo ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$')
    ) not valid;
  end if;
end $$;

-- Receipt access also requires the current sensitive-data notice to be accepted.
-- RESTRICTIVE policies compose with existing owner policies (which remain mandatory).
drop policy if exists "current consent required" on public.receipts;
create policy "current consent required" on public.receipts as restrictive
  for all to authenticated
  using (exists (select 1 from public.account_consents c
                where c.user_id = (select auth.uid()) and c.terms_version = '2026-10-22'
                  and c.health_version = '2026-10-22'))
  with check (exists (select 1 from public.account_consents c
                     where c.user_id = (select auth.uid()) and c.terms_version = '2026-10-22'
                       and c.health_version = '2026-10-22'));

revoke all on public.yearly_totals from public, anon;
grant select on public.yearly_totals to authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke create on schema public from public, anon, authenticated;
