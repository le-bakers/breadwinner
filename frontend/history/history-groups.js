// Individual U.S. tax years follow January through December.
export function groupReceipts(receipts, oldestFirst = false) {
  const years = new Map();
  for (const receipt of receipts) {
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(receipt.date || '');
    const date = match && new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    const valid = date && date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]);
    const year = valid ? Number(match[1]) : null;
    const month = valid ? Number(match[2]) : null;
    if (!years.has(year)) years.set(year, { year, receipts: [], months: new Map() });
    const group = years.get(year);
    group.receipts.push(receipt);
    if (!group.months.has(month)) group.months.set(month, { year, month, receipts: [] });
    group.months.get(month).receipts.push(receipt);
  }
  const compare = (a, b) => a === null ? 1 : b === null ? -1 : oldestFirst ? a - b : b - a;
  return [...years.values()].sort((a, b) => compare(a.year, b.year)).map(group => ({
    ...group,
    months: [...group.months.values()].sort((a, b) => compare(a.month, b.month))
  }));
}

export function receiptStats(receipts) {
  const value = number => Number.isFinite(Number(number)) ? Number(number) : 0;
  return {
    deductible: Math.round(receipts.reduce((sum, receipt) => sum + value(receipt.overcharge), 0) * 100) / 100,
    scanned: receipts.length,
    gfItems: receipts.reduce((sum, receipt) => sum + value(receipt.gfItems), 0)
  };
}
