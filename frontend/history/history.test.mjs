import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Load the browser module without changing the repository's module settings.
const source = await readFile(new URL('./history-groups.js', import.meta.url), 'utf8');
const { groupReceipts, receiptStats } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('tax years end in December, including receipts before the April filing deadline', () => {
  const receipts = [
    { date: '2025-12-31', overcharge: 10, gfItems: 2 },
    { date: '2026-01-01', overcharge: 20, gfItems: 3 },
    { date: '2026-04-14', overcharge: 5, gfItems: 1 }
  ];
  const groups = groupReceipts(receipts);
  assert.deepEqual(groups.map(group => group.year), [2026, 2025]);
  assert.deepEqual(groups[0].months.map(group => group.month), [4, 1]);
  assert.deepEqual(receiptStats(groups[0].receipts), { deductible: 25, scanned: 2, gfItems: 4 });
});

test('the same month in different years stays separate and monthly totals roll up', () => {
  const groups = groupReceipts([
    { date: '2026-02-01', overcharge: 0.1, gfItems: 1 },
    { date: '2025-02-03', overcharge: 9, gfItems: 4 },
    { date: '2026-02-15', overcharge: 0.2, gfItems: 2 },
    { date: '2026-03-15', overcharge: 7, gfItems: 3 }
  ]);
  assert.deepEqual(receiptStats(groups[0].months[1].receipts), { deductible: 0.3, scanned: 2, gfItems: 3 });
  assert.deepEqual(receiptStats(groups[0].receipts), { deductible: 7.3, scanned: 3, gfItems: 6 });
  assert.equal(groups[1].months[0].receipts.length, 1);
});

test('oldest sorting orders both years and months while preserving receipt order', () => {
  const receipts = [{ date: '2026-04-10' }, { date: '2025-12-05' }, { date: '2026-01-15' }, { date: '2026-04-01' }];
  const groups = groupReceipts(receipts, true);
  assert.deepEqual(groups.map(group => group.year), [2025, 2026]);
  assert.deepEqual(groups[1].months.map(group => group.month), [1, 4]);
  assert.deepEqual(groups[1].months[1].receipts, [receipts[0], receipts[3]]);
});

test('receipt edits update year and month totals through the original receipt objects', () => {
  const receipt = { date: '2026-10-24', overcharge: 12, gfItems: 3 };
  const [year] = groupReceipts([receipt]);
  receipt.overcharge = 17.5;
  receipt.gfItems = 4;
  for (const receipts of [year.receipts, year.months[0].receipts]) {
    assert.deepEqual(receiptStats(receipts), { deductible: 17.5, scanned: 1, gfItems: 4 });
  }
});

test('missing and invalid dates remain accessible in an undated group', () => {
  const groups = groupReceipts([{ date: '2026-02-30' }, {}, { date: '2026-13-01' }, { date: '2024-02-29' }]);
  assert.equal(groups[0].year, 2024);
  assert.equal(groups[1].year, null);
  assert.equal(groups[1].months[0].month, null);
  assert.equal(groups[1].receipts.length, 3);
});

test('empty results and processing receipts without totals are safe', () => {
  assert.deepEqual(groupReceipts([]), []);
  assert.deepEqual(receiptStats([]), { deductible: 0, scanned: 0, gfItems: 0 });
  assert.deepEqual(receiptStats([{ processing: true }, { overcharge: '2.50', gfItems: '2' }]), { deductible: 2.5, scanned: 2, gfItems: 2 });
});

// ---- Tax summary and exports (tax-data.js) ----
const taxSource = await readFile(new URL('./tax-data.js', import.meta.url), 'utf8');
const tax = await import('data:text/javascript;base64,' + Buffer.from(taxSource).toString('base64'));

const sampleReceipts = [
  { name: 'costco run', date: '2026-10-25', lines: [
    { name: 'GF BREAD', price: 6.49, quantity: 1, gf: true, compare: { source: 'kroger', quantity: 1, regularName: 'White Bread', regularPrice: 3.49, regularSize: '20 oz', gfSize: '14 oz', scaledRegularPrice: 2.44, sizesComparable: true, deduction: 4.05, warnings: [], date: '2026-10-25' } },
    { name: 'MILK', price: 3.2, quantity: 1, gf: false },
    { name: '=GF PASTA', price: 4, quantity: 1, gf: true }
  ] },
  { name: 'target', date: '2026-03-02', lines: [
    { name: 'XANTHAN GUM', price: 9, quantity: 1, gf: true, compare: { source: 'none', quantity: 1, deduction: 9, warnings: [] } }
  ] },
  { name: 'still scanning', date: '2026-04-01', processing: true, lines: [{ name: 'X', price: 1, gf: true }] }
];

test('tax summary lists only gluten-free items, oldest first, and counts the ones still waiting', () => {
  const summary = tax.collectItems(sampleReceipts);
  assert.deepEqual(summary.items.map(item => item.name), ['XANTHAN GUM', 'GF BREAD', '=GF PASTA']);
  assert.equal(summary.total, 13.05);
  assert.equal(summary.waiting, 1);
});

test('export rows use real numbers, one total row, and carry the disclaimer', () => {
  const rows = tax.buildRows(tax.collectItems(sampleReceipts));
  assert.equal(rows[0].length, tax.HEADERS.length);
  assert.equal(typeof rows[1][4], 'number');
  assert.equal(rows.at(-2)[8], 13.05);
  assert.equal(rows.at(-1)[0], tax.DISCLAIMER);
  assert.match(rows[2][9], /Regular version \$3\.49 for 20 oz, which is \$2\.44 for 14 oz/);
});

test('csv writes plain numbers and defuses cells that start like a formula', () => {
  const csv = tax.makeCsv(tax.buildRows(tax.collectItems(sampleReceipts)));
  assert.match(csv, /,4\.05,/);
  assert.match(csv, /"'=GF PASTA"/);
});

test('xlsx is a valid zip with numbers stored as numbers', async () => {
  const bytes = Buffer.from(await tax.makeXlsx(tax.buildRows(tax.collectItems(sampleReceipts))).arrayBuffer());
  assert.equal(bytes.readUInt32LE(0), 0x04034b50);
  const text = bytes.toString('latin1');
  assert.match(text, /<c r="I3" s="1"><v>4\.05<\/v><\/c>/);
  assert.ok(bytes.readUInt32LE(14) > 0, 'local header holds the crc');
});

test('the print page escapes item names', () => {
  const html = tax.makePdfHtml(tax.collectItems([{ name: 'r', date: '2026-01-01', lines: [{ name: '<b>GF</b>', price: 1, gf: true }] }]), 'Tax year 2026');
  assert.ok(!html.includes('<b>GF</b>'));
  assert.match(html, /Tax year 2026/);
});

test('history uses the same receipt row template as the dashboard', async () => {
  // home.js builds every row from #rowTemplate, so a missing piece on one page blanks that page's table.
  const template = async path => {
    const html = await readFile(new URL(path, import.meta.url), 'utf8');
    return html.match(/<template id="rowTemplate">[\s\S]*?<\/template>/)[0];
  };
  assert.equal(await template('./history.html'), await template('../home/home.html'));
});
