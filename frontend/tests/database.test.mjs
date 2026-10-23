import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('database enforces ownership, current consent, immutable evidence and cascading deletion', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
      insert into auth.users values ('00000000-0000-0000-0000-000000000001'),
                                   ('00000000-0000-0000-0000-000000000002');
    `);
    const migration = await readFile('../backend/database.sql', 'utf8');
    await db.exec(migration);
    await db.exec(migration); // migration must be repeatable without losing records
    async function asUser(id = 1) {
      await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000${id}';`);
    }
    await asUser();
    const addReceipt = `insert into public.receipts (id, store_name, receipt_date)
      values ('10000000-0000-0000-0000-000000000001', 'Synthetic', '2026-10-22')`;
    await assert.rejects(db.exec(addReceipt), /row-level security/);
    const accept = `insert into public.account_consents (terms_version, health_version, adult_confirmed, health_processing)
      values ('2026-10-22', '2026-10-22', true, true)`;
    await db.exec(accept);
    await assert.rejects(db.exec(`insert into public.account_consents
      (user_id, terms_version, health_version, adult_confirmed, health_processing, accepted_at)
      values ('00000000-0000-0000-0000-000000000002', '2026-10-22', '2026-10-22', true, true, '2000-01-01')`), /permission denied/);
    await assert.rejects(db.exec(`update public.account_consents set accepted_at = '2000-01-01'`), /permission denied/);
    await db.exec(addReceipt);
    assert.equal((await db.query('select * from public.receipts')).rows.length, 1);
    await assert.rejects(db.exec(`update public.receipts set user_id = '00000000-0000-0000-0000-000000000002'`), /row-level security/);
    await assert.rejects(db.exec(`update public.receipts set photo = 'https://attacker.example/pixel'`), /receipts_payload_bounds/);
    await asUser(2);
    await db.exec(accept);
    assert.equal((await db.query('select * from public.receipts')).rows.length, 0);
    await db.exec('delete from public.receipts');
    assert.equal((await db.query('select * from public.account_consents')).rows.length, 1);
    await db.exec('reset role; set role anon');
    await assert.rejects(db.query('select * from public.receipts'), /permission denied/);
    await assert.rejects(db.query('select public.delete_my_account()'), /permission denied/);
    await asUser();
    assert.equal((await db.query('select * from public.receipts')).rows.length, 1);
    await db.exec('delete from public.account_consents');
    assert.equal((await db.query('select * from public.receipts')).rows.length, 0);
    const changed = await db.query(`update public.receipts set store_name = 'changed' returning *`);
    assert.equal(changed.rows.length, 0);
    // Account deletion remains available after consent withdrawal.
    await db.exec('select public.delete_my_account()');
    await db.exec('reset role');
    assert.equal((await db.query('select * from public.receipts')).rows.length, 0);
    assert.equal((await db.query('select * from auth.users')).rows.length, 1);
    assert.equal((await db.query('select * from public.account_consents')).rows.length, 1);
  } finally {
    await db.close();
  }
});
