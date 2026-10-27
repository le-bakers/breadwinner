// @ts-nocheck
/* ============================================
   BreadWinner — suggested comparisons
   Fills in a comparison for a gluten-free item, so the user only has to approve it.
   home.js asks in this order:
     1. BreadWinner.suggest.recall     the same item at the same price was compared before
     2. BreadWinner.suggest.askKroger  the Python server (GET /suggest) picks a Kroger product
   A suggestion is never counted in a total. home.js shows it with an Approve button.
   ============================================ */

(function () {
  'use strict';

  const ZIP_STORAGE_KEY = 'breadwinner_zip';  // also used by compare.js
  const KEEP_DAYS = 90;  // a regular price older than this is too stale to reuse, so it is looked up fresh

  function today() {
    const now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  }

  function daysSince(dateText) {
    return (new Date(today() + 'T00:00') - new Date(dateText + 'T00:00')) / 86400000;
  }

  function getZip() {
    try { return localStorage.getItem(ZIP_STORAGE_KEY) || ''; } catch (e) { return ''; }
  }

  function setZip(zip) {
    try { localStorage.setItem(ZIP_STORAGE_KEY, zip); } catch (e) { /* storage unavailable */ }
  }

  // Same name AND same price. A different price can mean a different size or a different
  // number of packages, so it is treated as a different item.
  function sameItem(a, b) {
    return a.name.trim().toUpperCase() === b.name.trim().toUpperCase() && Math.abs(a.price - b.price) < 0.005;
  }

  // Looks through the receipts saved on this device for the newest comparison the user
  // approved for this same item. Nothing extra is stored: deleting a receipt forgets it too.
  function recall(line, receipts) {
    let newest = null;
    receipts.forEach((receipt) => receipt.lines.forEach((other) => {
      if (other === line || !other.gf || !other.compare || !other.compare.date) return;
      if (!sameItem(line, other) || daysSince(other.compare.date) > KEEP_DAYS) return;
      if (!newest || other.compare.date > newest.date) newest = other.compare;
    }));
    // The copy keeps the day the regular price was really looked up
    return newest ? Object.assign({}, newest, { from: 'memory' }) : null;
  }

  // Asks the server for Kroger's regular version of this item.
  // Gives back { draft, problem }: draft is null when there is nothing to suggest.
  async function askKroger(line, zip, apiBase) {
    const quantity = line.quantity || 1;
    const params = new URLSearchParams({
      zip: zip,
      term: line.regularTerm || line.plainName || line.name,  // an item the user ticked may have no search term yet
      gf_name: line.plainName || line.name,
      gf_price: line.price,
      quantity: quantity,
      gf_size_guess: line.sizeGuess || ''  // used when Kroger's listing can't tell us the size
    });

    let response;
    try { response = await fetch(apiBase + '/suggest?' + params.toString()); }
    catch (error) {
      // fetch throws when nothing answers at apiBase (the Python server is off)
      return { draft: null, problem: 'The price server is not running, so no prices could be suggested.' };
    }

    if (response.status === 404) return { draft: null, problem: 'No Kroger-family store is near that zip code. Use "Compare price" instead.' };
    if (response.status === 502) return { draft: null, problem: 'Kroger could not be reached right now. Try again in a minute.' };
    if (!response.ok) return { draft: null, problem: '' };

    const answer = await response.json();
    if (!answer.regular) return { draft: null, problem: '' };  // Kroger found no regular version

    return {
      problem: '',
      draft: {
        from: 'kroger',
        source: 'kroger',
        gfSize: answer.gf_size,
        sizeGuessed: Boolean(answer.gf_size),  // the size came from Kroger's listing or the reader, not from the user
        quantity: quantity,
        term: params.get('term'),
        regularName: answer.regular.name,
        regularPrice: answer.regular.price,
        regularSize: answer.regular.size || '',
        scaledRegularPrice: answer.scaled_regular_price,
        deduction: answer.deduction,
        sizesComparable: answer.sizes_comparable,
        warnings: answer.warnings,
        date: today()
      }
    };
  }

  window.BreadWinner = window.BreadWinner || {};
  window.BreadWinner.suggest = { recall, askKroger, getZip, setZip };
})();
