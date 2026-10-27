// @ts-nocheck
import { groupReceipts, receiptStats } from './history-groups.js';
import { openTaxSummary, makeExportMenu } from './tax-summary.js';
const openSections = new Map();
let summaries = [];
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const monthName = new Intl.DateTimeFormat('en-US', { month: 'long' });
// title is the heading on screen ("October"); fullTitle is used in the pop-up ("October 2026").
// slug goes in file names, e.g. 2026 or 2026-10.
function makeSection(key, title, fullTitle, receipts, level, slug) {
    const section = document.createElement('details');
    section.className = 'history-group history-' + level;
    section.dataset.groupKey = key;
    section.open = openSections.get(key) ?? true;
    const summary = document.createElement('summary');
    const head = document.createElement('div');
    head.className = 'history-group-head';
    const heading = document.createElement(level === 'year' ? 'h2' : 'h3');
    heading.className = 'history-group-title';
    heading.textContent = title;
    const count = document.createElement('p');
    count.className = 'history-group-count';
    head.append(heading, count);
    const stat = document.createElement('span');
    stat.className = 'history-stat';
    const value = document.createElement('strong');
    value.className = 'metric-number';
    const caption = document.createElement('span');
    caption.textContent = 'Deduction';
    stat.append(value, caption);
    // What the buttons use: the receipts shown in this group, so the pop-up and files match the screen
    const group = { getReceipts: () => receipts, title: fullTitle, slug };
    const actions = document.createElement('div');
    actions.className = 'history-actions';
    const summaryButton = document.createElement('button');
    summaryButton.type = 'button';
    summaryButton.className = 'btn btn-secondary btn-sm history-summary-button';
    summaryButton.textContent = 'Tax summary';
    summaryButton.addEventListener('click', () => openTaxSummary(group, summaryButton));
    actions.append(summaryButton, makeExportMenu(group));
    summaries.push({ receipts, value, count });
    summary.append(head, stat, actions);
    section.appendChild(summary);
    return section;
}
window.BreadWinner = window.BreadWinner || {};
window.BreadWinner.receiptHistory = {
    refresh() {
        for (const { receipts, value, count } of summaries) {
            const stats = receiptStats(receipts);
            value.textContent = money.format(stats.deductible);
            count.textContent = stats.scanned + (stats.scanned === 1 ? ' receipt' : ' receipts') + ' · ' + stats.gfItems + ' GF item' + (stats.gfItems === 1 ? '' : 's');
        }
    },
    render(table, receipts, buildRow) {
        table.querySelectorAll('details[data-group-key]').forEach(section => {
            openSections.set(section.dataset.groupKey, section.open);
        });
        const header = table.querySelector('.receipt-row-head');
        table.classList.add('history-groups');
        table.classList.remove('receipt-table');
        // Keep a pristine column header to place inside each month's table.
        if (header && !this.header)
            this.header = header.cloneNode(true);
        table.replaceChildren();
        summaries = [];
        if (!receipts.length) {
            const empty = document.createElement('p');
            empty.className = 'receipt-empty';
            empty.textContent = document.getElementById('receiptSearch').value.trim()
                ? 'No receipts match your search.'
                : 'No saved receipts yet.';
            table.appendChild(empty);
            return;
        }
        const oldestFirst = document.getElementById('sortSelect').value === 'oldest';
        for (const year of groupReceipts(receipts, oldestFirst)) {
            const yearTitle = year.year === null ? 'Undated receipts' : 'Tax year ' + year.year;
            const yearSlug = year.year === null ? 'undated' : String(year.year);
            const section = makeSection('year-' + year.year, yearTitle, yearTitle, year.receipts, 'year', yearSlug);
            const content = document.createElement('div');
            content.className = 'history-year-content';
            for (const month of year.months) {
                const known = month.month !== null;
                const title = known ? monthName.format(new Date(month.year, month.month - 1, 1)) : 'Unknown month';
                const fullTitle = known ? title + ' ' + month.year : yearTitle + ' · ' + title;
                const slug = known ? month.year + '-' + String(month.month).padStart(2, '0') : yearSlug + '-unknown-month';
                const monthly = makeSection('month-' + month.year + '-' + month.month, title, fullTitle, month.receipts, 'month', slug);
                const rows = document.createElement('div');
                rows.className = 'receipt-table';
                if (this.header)
                    rows.appendChild(this.header.cloneNode(true));
                for (const receipt of month.receipts)
                    rows.appendChild(buildRow(receipt));
                monthly.appendChild(rows);
                content.appendChild(monthly);
            }
            section.appendChild(content);
            table.appendChild(section);
        }
        this.refresh();
    }
};
// Install grouping before the shared receipt controls load.
import('../home/home.js?v=11');
