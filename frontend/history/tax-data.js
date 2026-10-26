// @ts-nocheck
// Turns saved receipts into the tax summary: one row per gluten-free item, with the math behind each deduction.
// No page code in here, so it can be tested on its own (history.test.mjs). It only organizes numbers the user
// already approved. It does not file taxes or give tax advice.
export const DISCLAIMER = 'An organized estimate, not tax advice. Confirm with a tax professional.';
// Columns in the spreadsheet that hold dollar amounts (0 is the first column)
export const MONEY_COLUMNS = [4, 6, 8];
export const HEADERS = [
    'Date', 'Receipt', 'Gluten-free item', 'Qty', 'Price paid',
    'Regular version', 'Regular price', 'Price source', 'Potential deduction', 'How it was worked out'
];
const dollars = (n) => '$' + Number(n).toFixed(2);
const round2 = (n) => Math.round(n * 100) / 100;
// Same math the compare popup shows, so the schedule matches what the user approved
function workedOut(compare) {
    if (compare.source === 'none')
        return 'No regular version exists, so the full price is counted.';
    const quantity = compare.quantity || 1;
    const scaled = Number(compare.scaledRegularPrice) || 0;
    let text = 'Regular version ' + dollars(compare.regularPrice || 0) + (compare.regularSize ? ' for ' + compare.regularSize : '');
    if (compare.sizesComparable)
        text += ', which is ' + dollars(scaled) + (compare.gfSize ? ' for ' + compare.gfSize : '');
    text += '. Deduction ' + dollars(compare.deduction || 0) + (quantity > 1 ? ' (' + quantity + ' items)' : '') + '.';
    if (compare.warnings && compare.warnings.length)
        text += ' ' + compare.warnings.join(' ');
    return text;
}
function sourceLabel(compare) {
    if (compare.source === 'kroger')
        return 'Kroger shelf price' + (compare.date ? ' on ' + compare.date : '');
    if (compare.source === 'manual')
        return 'Entered by you';
    return 'No regular version';
}
// receipts -> { items, total, waiting }. waiting = gluten-free items with no price comparison yet (they count as $0).
export function collectItems(receipts) {
    const items = [];
    let waiting = 0;
    for (const receipt of receipts) {
        if (receipt.processing)
            continue;
        for (const line of receipt.lines || []) {
            if (!line.gf)
                continue;
            const compare = line.compare;
            if (!compare)
                waiting++;
            const hasRegular = compare && compare.source !== 'none';
            items.push({
                date: receipt.date || '',
                receipt: receipt.name || '',
                name: line.name || '',
                quantity: (compare && compare.quantity) || line.quantity || 1,
                paid: Number(line.price) || 0,
                regularName: hasRegular ? (compare.regularName || '') : '',
                regularSize: hasRegular ? (compare.regularSize || '') : '',
                regularPrice: hasRegular ? Number(compare.regularPrice) || 0 : null,
                source: compare ? sourceLabel(compare) : '',
                deduction: compare ? Number(compare.deduction) || 0 : 0,
                done: !!compare,
                note: compare ? workedOut(compare) : 'Needs a price comparison. Counted as $0 until you add one.'
            });
        }
    }
    items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)); // oldest first, like a ledger
    return { items, total: round2(items.reduce((sum, item) => sum + item.deduction, 0)), waiting };
}
// The table the spreadsheet files are made from: header, one row per item, then a total and the disclaimer
export function buildRows(summary) {
    const rows = [HEADERS];
    for (const item of summary.items) {
        rows.push([
            item.date, item.receipt, item.name, item.quantity, item.paid,
            item.regularName ? item.regularName + (item.regularSize ? ' (' + item.regularSize + ')' : '') : '',
            item.regularPrice === null ? '' : item.regularPrice,
            item.source, item.deduction, item.note
        ]);
    }
    rows.push(['', '', 'Total', '', '', '', '', '', summary.total, '']);
    rows.push([DISCLAIMER]);
    return rows;
}
/* ---------- CSV ---------- */
// A text cell starting with = + - or @ could run as a formula in a spreadsheet, so it gets a leading '
function csvCell(value, column) {
    if (typeof value === 'number')
        return MONEY_COLUMNS.includes(column) ? value.toFixed(2) : String(value);
    let text = value === null || value === undefined ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(text))
        text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
}
export function makeCsv(rows) {
    return '﻿' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}
/* ---------- Excel (.xlsx is a zip of small XML files) ---------- */
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const COLUMN_WIDTHS = [12, 22, 34, 6, 12, 38, 12, 24, 18, 60];
function xmlText(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function columnLetter(index) { return String.fromCharCode(65 + index); }
// style 0 plain, 1 dollars, 2 bold, 3 bold dollars (see styles below)
function xlsxCell(value, column, rowNumber, bold) {
    const ref = columnLetter(column) + rowNumber;
    if (typeof value === 'number') {
        const style = MONEY_COLUMNS.includes(column) ? (bold ? 3 : 1) : (bold ? 2 : 0);
        return '<c r="' + ref + '" s="' + style + '"><v>' + value + '</v></c>';
    }
    const text = value === null || value === undefined ? '' : String(value);
    if (text === '')
        return '';
    return '<c r="' + ref + '" t="inlineStr" s="' + (bold ? 2 : 0) + '"><is><t>' + xmlText(text) + '</t></is></c>';
}
function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
        crc ^= bytes[i];
        for (let j = 0; j < 8; j++)
            crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}
export function makeXlsx(rows) {
    const encoder = new TextEncoder();
    const lastRow = rows.length;
    const sheetRows = rows.map((row, i) => {
        const bold = i === 0 || i === lastRow - 2; // the header and the total row
        return '<row r="' + (i + 1) + '">' + row.map((value, column) => xlsxCell(value, column, i + 1, bold)).join('') + '</row>';
    }).join('');
    const columns = COLUMN_WIDTHS.map((width, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + width + '" customWidth="1"/>').join('');
    const sheet = XML_HEAD + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
        + '<cols>' + columns + '</cols><sheetData>' + sheetRows + '</sheetData></worksheet>';
    const styles = XML_HEAD + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        + '<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/></numFmts>'
        + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
        + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
        + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        + '<cellXfs count="4">'
        + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
        + '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
        + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
        + '<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>'
        + '</cellXfs></styleSheet>';
    const parts = {
        '[Content_Types].xml': XML_HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
        '_rels/.rels': XML_HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        'xl/workbook.xml': XML_HEAD + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Gluten-free deductions" sheetId="1" r:id="rId1"/></sheets></workbook>',
        'xl/_rels/workbook.xml.rels': XML_HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
        'xl/styles.xml': styles,
        'xl/worksheets/sheet1.xml': sheet
    };
    // The zip: each file stored as-is (no compression), then a directory of the files at the end
    const chunks = [], central = [];
    let offset = 0;
    Object.keys(parts).forEach((name) => {
        const nameBytes = encoder.encode(name), data = encoder.encode(parts[name]), crc = crc32(data);
        const local = new Uint8Array(30 + nameBytes.length + data.length);
        const view = new DataView(local.buffer);
        view.setUint32(0, 0x04034b50, true);
        view.setUint16(4, 20, true);
        view.setUint32(14, crc, true);
        view.setUint32(18, data.length, true);
        view.setUint32(22, data.length, true);
        view.setUint16(26, nameBytes.length, true);
        local.set(nameBytes, 30);
        local.set(data, 30 + nameBytes.length);
        chunks.push(local);
        const entry = new Uint8Array(46 + nameBytes.length);
        const entryView = new DataView(entry.buffer);
        entryView.setUint32(0, 0x02014b50, true);
        entryView.setUint16(4, 20, true);
        entryView.setUint16(6, 20, true);
        entryView.setUint32(16, crc, true);
        entryView.setUint32(20, data.length, true);
        entryView.setUint32(24, data.length, true);
        entryView.setUint16(28, nameBytes.length, true);
        entryView.setUint32(42, offset, true);
        entry.set(nameBytes, 46);
        central.push(entry);
        offset += local.length;
    });
    const centralSize = central.reduce((sum, entry) => sum + entry.length, 0);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, central.length, true);
    endView.setUint16(10, central.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, offset, true);
    return new Blob([...chunks, ...central, end], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
/* ---------- PDF (a clean page the browser prints or saves as PDF) ---------- */
export function makePdfHtml(summary, title) {
    const body = summary.items.map((item) => {
        const regular = item.regularName
            ? xmlText(item.regularName + (item.regularSize ? ' (' + item.regularSize + ')' : '')) + ' · ' + dollars(item.regularPrice)
            : '—';
        return '<tr><td>' + xmlText(item.date) + '</td>'
            + '<td><strong>' + xmlText(item.name) + '</strong><small>' + xmlText(item.receipt) + (item.source ? ' · ' + xmlText(item.source) : '') + '</small>'
            + '<small>' + xmlText(item.note) + '</small></td>'
            + '<td class="n">' + item.quantity + '</td><td class="n">' + dollars(item.paid) + '</td>'
            + '<td>' + regular + '</td><td class="n"><strong>' + dollars(item.deduction) + '</strong></td></tr>';
    }).join('');
    const waiting = summary.waiting
        ? '<p class="warn">' + summary.waiting + (summary.waiting === 1 ? ' gluten-free item has' : ' gluten-free items have') + ' no price comparison yet and count as $0.00.</p>'
        : '';
    return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>' + xmlText(title) + '</title><style>'
        + '@page{margin:14mm}body{font:12px/1.45 Arial,Helvetica,sans-serif;color:#1f2933;margin:0}'
        + 'h1{font-size:20px;margin:0 0 2px}.sub{color:#59665f;margin:0 0 14px}'
        + '.total{font-size:26px;font-weight:700;margin:0}.label{color:#59665f;margin:0 0 12px}'
        + 'table{width:100%;border-collapse:collapse}th{text-align:left;font-size:11px;color:#59665f;border-bottom:2px solid #1f2933;padding:6px 6px}'
        + 'td{padding:7px 6px;border-bottom:1px solid #d9dfdb;vertical-align:top}tr{break-inside:avoid}'
        + 'td small{display:block;color:#59665f;font-size:10.5px}.n{text-align:right;white-space:nowrap}'
        + 'tfoot td{border-top:2px solid #1f2933;border-bottom:0;font-weight:700}'
        + '.warn{background:#fef9e7;border:1px solid #f0e0a0;padding:8px 10px;border-radius:6px}'
        + '.note{margin-top:16px;color:#59665f;font-size:11px}</style></head><body>'
        + '<h1>Gluten-free extra cost summary</h1><p class="sub">' + xmlText(title) + ' · Prepared ' + new Date().toISOString().slice(0, 10) + ' with BreadWinner</p>'
        + '<p class="total">' + dollars(summary.total) + '</p><p class="label">Potential deduction from ' + summary.items.length + ' gluten-free item' + (summary.items.length === 1 ? '' : 's') + '</p>'
        + waiting
        + '<table><thead><tr><th>Date</th><th>Gluten-free item</th><th class="n">Qty</th><th class="n">Paid</th><th>Regular version</th><th class="n">Deduction</th></tr></thead>'
        + '<tbody>' + body + '</tbody><tfoot><tr><td colspan="5">Total</td><td class="n">' + dollars(summary.total) + '</td></tr></tfoot></table>'
        + '<p class="note">' + DISCLAIMER + ' Keep the original receipts and a doctor’s letter with your records.</p>'
        + '</body></html>';
}
