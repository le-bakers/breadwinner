// @ts-nocheck
// The page side of the tax summary: the pop-up, and the Export menu (CSV, Excel, PDF) for a year or a month.
// The numbers come from tax-data.js. Nothing here files taxes or gives tax advice.
import { collectItems, buildRows, makeCsv, makeXlsx, makePdfHtml, DISCLAIMER } from './tax-data.js';
const money = (n) => '$' + Number(n).toFixed(2);
const esc = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function showDate(iso) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    if (!match)
        return 'No date';
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}
function toast(message) {
    if (window.BreadWinner && window.BreadWinner.toast)
        window.BreadWinner.toast(message);
}
function download(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// The browser's Print window has "Save as PDF" in it, so no PDF library is needed
function printPage(html) {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
    document.body.appendChild(frame);
    frame.srcdoc = html;
    frame.onload = () => {
        frame.contentWindow.focus();
        frame.contentWindow.print();
        setTimeout(() => frame.remove(), 60000);
    };
}
// format: csv | xlsx | pdf. group = { getReceipts, title, slug }
export function exportGroup(format, group) {
    const summary = collectItems(group.getReceipts());
    if (!summary.items.length) {
        toast('No gluten-free items in ' + group.title + ' to export yet.');
        return;
    }
    const name = 'breadwinner-gluten-free-' + group.slug;
    if (format === 'pdf') {
        printPage(makePdfHtml(summary, group.title));
        toast('Choose “Save as PDF” in the print window.');
        return;
    }
    const rows = buildRows(summary);
    if (format === 'xlsx')
        download(makeXlsx(rows), name + '.xlsx');
    else
        download(new Blob([makeCsv(rows)], { type: 'text/csv;charset=utf-8' }), name + '.csv');
    toast((format === 'xlsx' ? 'Excel file' : 'CSV file') + ' saved. Review it with your tax professional.');
}
/* ---------- Export menu ---------- */
function closeMenus(except) {
    document.querySelectorAll('.export-menu-options').forEach((menu) => {
        if (menu === except)
            return;
        menu.hidden = true;
        menu.previousElementSibling.setAttribute('aria-expanded', 'false');
    });
}
document.addEventListener('click', (event) => { if (!event.target.closest('.export-menu'))
    closeMenus(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape')
    closeMenus(); });
export function makeExportMenu(group, label = 'Export') {
    const wrap = document.createElement('div');
    wrap.className = 'export-menu';
    wrap.innerHTML = '<button type="button" class="btn btn-secondary btn-sm export-button" aria-haspopup="true" aria-expanded="false">'
        + '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 19h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        + '<span>' + label + '</span></button>'
        + '<div class="export-menu-options" hidden>'
        + '<button type="button" data-format="pdf">PDF (print or save)</button>'
        + '<button type="button" data-format="xlsx">Excel file (.xlsx)</button>'
        + '<button type="button" data-format="csv">CSV file (.csv)</button></div>';
    const button = wrap.querySelector('.export-button');
    const menu = wrap.querySelector('.export-menu-options');
    button.addEventListener('click', () => {
        closeMenus(menu);
        menu.hidden = !menu.hidden;
        button.setAttribute('aria-expanded', String(!menu.hidden));
    });
    menu.addEventListener('click', (event) => {
        const choice = event.target.closest('[data-format]');
        if (!choice)
            return;
        menu.hidden = true;
        button.setAttribute('aria-expanded', 'false');
        exportGroup(choice.dataset.format, group);
    });
    return wrap;
}
/* ---------- Tax summary pop-up ---------- */
let overlay = null;
let openedFrom = null;
function closeSummary() {
    if (!overlay || overlay.hidden)
        return;
    overlay.hidden = true;
    document.body.style.overflow = '';
    if (openedFrom && openedFrom.isConnected)
        openedFrom.focus();
    openedFrom = null;
}
function buildOverlay() {
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.hidden = true;
    overlay.addEventListener('click', (event) => { if (event.target === overlay)
        closeSummary(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !overlay.hidden)
        closeSummary(); });
    document.body.appendChild(overlay);
}
function itemHtml(item) {
    const regular = item.regularName
        ? 'Regular: ' + esc(item.regularName) + (item.regularSize ? ' (' + esc(item.regularSize) + ')' : '') + ' · ' + money(item.regularPrice)
        : item.done ? 'No regular version exists' : '';
    const meta = [showDate(item.date), esc(item.receipt)].filter(Boolean).join(' · ');
    return '<li class="tax-item' + (item.done ? '' : ' is-waiting') + '">'
        + '<div class="tax-item-main"><span class="tax-item-name">' + esc(item.name) + '</span>'
        + '<span class="tax-item-meta">' + meta + '</span>'
        + (item.done ? '<span class="tax-item-meta">' + regular + '</span>' : '<span class="tax-item-alert">Needs a price comparison</span>')
        + '</div><div class="tax-item-amounts"><strong>' + money(item.deduction) + '</strong><span>paid ' + money(item.paid) + '</span></div></li>';
}
// group = { getReceipts, title, slug }; opener = the button that was pressed (focus goes back to it)
export function openTaxSummary(group, opener) {
    if (!overlay)
        buildOverlay();
    const summary = collectItems(group.getReceipts());
    const searching = (document.getElementById('receiptSearch') || {}).value;
    const count = summary.items.length;
    const note = summary.waiting
        ? '<p class="tax-banner">' + summary.waiting + (summary.waiting === 1 ? ' gluten-free item has' : ' gluten-free items have')
            + ' no price comparison yet. ' + (summary.waiting === 1 ? 'It counts' : 'They count') + ' as $0.00 until you add one. Open the receipt and press “Compare price”.</p>'
        : '';
    overlay.innerHTML = '<div class="modal-card tax-card" role="dialog" aria-modal="true" aria-labelledby="taxTitle">'
        + '<div class="tax-head"><div><p class="tax-kicker">Tax summary</p><h3 id="taxTitle">' + esc(group.title) + '</h3></div>'
        + '<button type="button" class="tax-close" aria-label="Close">'
        + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button></div>'
        + '<div class="tax-total"><span class="tax-total-label">Potential deduction</span><strong>' + money(summary.total) + '</strong>'
        + '<span class="tax-total-sub">from ' + count + ' gluten-free item' + (count === 1 ? '' : 's') + '</span></div>'
        + note
        + (searching ? '<p class="tax-banner tax-banner-info">Showing only receipts that match “' + esc(searching) + '”. Clear the search to see everything.</p>' : '')
        + (count ? '<ul class="tax-list">' + summary.items.map(itemHtml).join('') + '</ul>'
            : '<p class="tax-empty">No gluten-free items here yet. Mark items as gluten-free on a receipt and compare them with the regular version.</p>')
        + '<details class="tax-checklist"><summary>Before you file</summary><ul>'
        + '<li>The IRS may ask for a doctor’s letter confirming celiac disease.</li>'
        + '<li>Keep your original receipts. This summary shows the math, and the receipts are the proof.</li>'
        + '<li>Only medical costs above 7.5% of your income count, and only if you itemize deductions on Schedule A.</li>'
        + '<li>More detail: <a href="https://www.irs.gov/publications/p502" target="_blank" rel="noopener">IRS Publication 502</a>.</li></ul></details>'
        + '<p class="tax-disclaimer">' + DISCLAIMER + '</p>'
        + '<div class="tax-actions"><span class="tax-export-slot"></span><button type="button" class="btn btn-primary tax-done">Done</button></div></div>';
    overlay.querySelector('.tax-export-slot').replaceWith(makeExportMenu(group, 'Export'));
    overlay.querySelector('.tax-close').addEventListener('click', closeSummary);
    overlay.querySelector('.tax-done').addEventListener('click', closeSummary);
    openedFrom = opener || null;
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    overlay.querySelector('.tax-done').focus();
}
