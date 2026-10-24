// @ts-nocheck
import { groupReceipts, receiptStats } from './history-groups.js';

const openSections = new Map();
let summaries = [];
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const monthName = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });

function makeSection(key, title, receipts, level) {
  const section = document.createElement('details');
  section.className = 'history-group history-' + level;
  section.dataset.groupKey = key;
  section.open = openSections.get(key) ?? true;
  const summary = document.createElement('summary');
  const heading = document.createElement(level === 'year' ? 'h2' : 'h3');
  heading.className = 'history-group-title';
  heading.textContent = title;
  summary.appendChild(heading);
  const stats = document.createElement('span');
  stats.className = 'history-group-stats';
  const values = ['Total deductible', 'Receipts scanned', 'GF items'].map(label => {
    const stat = document.createElement('span');
    stat.className = 'history-stat';
    const value = document.createElement('strong');
    const caption = document.createElement('span');
    caption.textContent = label;
    stat.append(value, caption);
    stats.appendChild(stat);
    return value;
  });
  summaries.push({ receipts, values });
  summary.appendChild(stats);
  section.appendChild(summary);
  return section;
}

window.BreadWinner = window.BreadWinner || {};
window.BreadWinner.receiptHistory = {
  refresh() {
    for (const { receipts, values } of summaries) {
      const stats = receiptStats(receipts);
      values[0].textContent = money.format(stats.deductible);
      values[1].textContent = String(stats.scanned);
      values[2].textContent = String(stats.gfItems);
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
    if (header && !this.header) this.header = header.cloneNode(true);
    table.replaceChildren();
    summaries = [];
    if (!receipts.length) {
      const empty = document.createElement('p');
      empty.className = 'receipt-empty';
      empty.textContent = document.getElementById('receiptSearch').value.trim()
        ? 'No receipts match your search.'
        : 'No receipts yet! Click the green + button to upload or take a photo of a receipt.';
      table.appendChild(empty);
      return;
    }
    const oldestFirst = document.getElementById('sortSelect').value === 'oldest';
    for (const year of groupReceipts(receipts, oldestFirst)) {
      const section = makeSection('year-' + year.year, year.year === null ? 'Undated receipts' : 'Tax Year ' + year.year, year.receipts, 'year');
      const content = document.createElement('div');
      content.className = 'history-year-content';
      for (const month of year.months) {
        const title = month.month === null ? 'Unknown month' : monthName.format(new Date(month.year, month.month - 1, 1));
        const monthly = makeSection('month-' + month.year + '-' + month.month, title, month.receipts, 'month');
        const rows = document.createElement('div');
        rows.className = 'receipt-table';
        if (this.header) rows.appendChild(this.header.cloneNode(true));
        for (const receipt of month.receipts) rows.appendChild(buildRow(receipt));
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
import('../home/home.js?v=9');
