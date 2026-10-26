import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('./settings.js', import.meta.url), 'utf8').replace(/^import .*\r?$/m, '').split('/* ============================================\n   Profile page JS')[0];
function setup({ failExport = false, failDelete = false } = {}) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { disabled: false, textContent: '', dataset: {}, classList: { toggle() {} }, setAttribute(k,v) { this[k]=v; }, addEventListener(k,fn) { this[k]=fn; }, closest() { return { querySelector() { return {}; } }; } });
    return elements.get(id);
  };
  const theme = ['light','dark','system'].map(value => { const el=element(value); el.dataset.themeValue=value; return el; });
  const localStorage = { breadwinner_auth: 'SECRET', breadwinner_session: 'SESSION', breadwinner_user_name: 'Person', breadwinner_settings: '{"theme":"dark"}', unrelated: 'keep' };
  const sessionStorage = { breadwinner_auth: 'TAB SECRET', unrelated: 'keep' };
  for (const store of [localStorage,sessionStorage]) Object.defineProperties(store,{ getItem: { value(key) { return this[key]; } }, removeItem: { value(key) { delete this[key]; } } });
  const settings = { theme:'light', dateFormat:'MDY' };
  let download, signouts=0;
  const document = { getElementById:element, querySelectorAll() { return theme; }, querySelector:element, body:{appendChild(){}}, createElement() { return { click(){}, remove(){} }; } };
  const cloud = { enabled:true, async getUser() { return {email:'person@example.com'}; }, async loadProfilePhoto() { return "cloud-photo"; }, async loadReceipts() { if(failExport) throw Error('Offline'); return [{id:'receipt'}]; }, async signOut() { signouts++; }, async deleteAccount() { if(failDelete) throw Error('Offline'); } };
  const BW = { cloud, Settings: {getSettings:()=>settings, updateSetting:(key,value)=>settings[key]=value}, confirmModal:()=>({open(){},close(){}}) };
  const window = { BreadWinner:BW, location:{}, addEventListener(){} };
  vm.runInNewContext(source, { window, document, localStorage, sessionStorage, pageUrl: x=>x, Blob: class { constructor(parts) { download=JSON.parse(parts[0]); } }, URL:{ createObjectURL:()=> 'blob:test', revokeObjectURL(){} } });
  return { element, theme, settings, localStorage, sessionStorage, window, download:()=>download, signouts:()=>signouts };
}
test('theme and date controls persist preferences and expose pressed state', async()=> {
  const s=setup(); s.theme[1].click();
  assert.equal(s.settings.theme,'dark'); assert.equal(s.theme[1]['aria-pressed'],'true');
  s.element('dateFormatSelect').change({target:{value:'ISO'}});
  assert.equal(s.settings.dateFormat,'ISO');
});

test('export includes cloud receipts and excludes credentials and unrelated browser data',async()=>{
  const s=setup(); await s.element('exportDataBtn').click();
  assert.deepEqual(Object.keys(s.download()).sort(),['breadwinner_settings','breadwinner_user_name','profilePhoto','receipts']);
  assert.equal(s.download().receipts[0].id,'receipt'); assert.equal(s.element('exportDataBtn').disabled,false);
});
test('failed cloud export does not download an incomplete file and allows retry',async()=>{
  const s=setup({failExport:true}); await s.element('exportDataBtn').click();
  assert.equal(s.download(),undefined); assert.match(s.element('exportStatus').textContent,/Could not export/); assert.equal(s.element('exportDataBtn').disabled,false);
});
test('failed deletion preserves local data and allows retry',async()=>{
  const s=setup({failDelete:true}); const button=s.element('deleteAccountConfirm'); await button.click({target:button});
  assert.equal(s.localStorage.breadwinner_user_name,'Person'); assert.equal(s.window.location.href,undefined); assert.equal(button.disabled,false);
});
test('clearing a device removes app data from both stores while preserving unrelated data',async()=>{
  const s=setup(); const button=s.element('clearDataConfirm'); await button.click({target:button});
  assert.deepEqual(Object.keys(s.localStorage),['unrelated']); assert.deepEqual(Object.keys(s.sessionStorage),['unrelated']); assert.equal(s.signouts(),1); assert.equal(s.window.location.href,'/signin');
});

test('receipt date preferences preserve the calendar day and handle invalid dates', () => {
  const shared = fs.readFileSync(new URL('../shared.js', import.meta.url), 'utf8');
  const dateFunction = shared.slice(shared.indexOf('function formatDate('), shared.indexOf('function formatMoney('));
  for (const [dateFormat, expected] of [['ISO', '2026-10-24'], ['MDY', 'Oct 24, 2026'], ['DMY', '24 Oct 2026']]) {
    const context = vm.createContext({ getSettings: () => ({dateFormat}) });
    vm.runInContext(dateFunction, context);
    assert.equal(context.formatDate('2026-10-24'), expected);
    assert.equal(context.formatDate(new Date(2026, 9, 24, 23, 30)), expected);
    assert.equal(context.formatDate('invalid'), 'Unknown date');
  }
});
