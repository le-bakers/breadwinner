"use strict";
// @ts-nocheck
/* ============================================
   BreadWinner — "Compare with the regular version" popup
   home.js opens it with:
     BreadWinner.openCompare({ line, apiBase, opener, onSave })
   and gets the finished comparison back through onSave.
   The math itself is done by the Python server (GET /deduction).
   ============================================ */
(function () {
    'use strict';
    const modal = document.getElementById('compareModal');
    if (!modal)
        return;
    const el = (id) => document.getElementById(id);
    const form = modal.querySelector('form');
    const gfSizeInput = el('compareGfSize');
    const quantityInput = el('compareQuantity');
    const termInput = el('compareTerm');
    const zipInput = el('compareZip');
    const searchBtn = el('compareSearchBtn');
    const searchNote = el('compareSearchNote');
    const results = el('compareResults');
    const manualName = el('compareManualName');
    const manualPrice = el('compareManualPrice');
    const manualSize = el('compareManualSize');
    const outcomeBox = el('compareOutcome');
    const saveBtn = el('compareSave');
    const tabs = modal.querySelectorAll('.compare-tab');
    const panes = { kroger: el('compareKroger'), manual: el('compareManual'), none: el('compareNone') };
    const ZIP_STORAGE_KEY = 'breadwinner_zip';
    const money = (n) => '$' + Number(n).toFixed(2);
    // Accepts "4.99", "$4.99" and "4,99"
    const toPrice = (text) => Number(String(text).trim().replace(/\$/g, '').replace(',', '.'));
    let current = null; // what home.js handed over: { line, apiBase, opener, onSave }
    let source = 'kroger'; // which of the three ways to find the regular price is showing
    let picked = null; // the Kroger product the user chose
    let outcome = null; // the server's answer for what is on screen right now
    let askNumber = 0; // lets a slow answer be ignored once the user has changed something
    let typingTimer = null;
    function open(options) {
        current = options;
        const line = options.line;
        // A suggestion (line.draft) fills the popup in the same way a saved comparison does
        const saved = line.compare || line.draft || {};
        el('compareItemName').textContent = line.plainName || line.name;
        el('compareItemPrice').textContent = money(line.price);
        gfSizeInput.value = saved.gfSize || '';
        quantityInput.value = saved.quantity || line.quantity || 1;
        termInput.value = saved.term || line.regularTerm || '';
        try {
            zipInput.value = localStorage.getItem(ZIP_STORAGE_KEY) || '';
        }
        catch (e) {
            zipInput.value = '';
        }
        manualName.value = saved.source === 'manual' ? saved.regularName : '';
        manualPrice.value = saved.source === 'manual' ? saved.regularPrice : '';
        manualSize.value = saved.source === 'manual' ? (saved.regularSize || '') : '';
        // A Kroger product saved earlier is shown again, already chosen
        picked = saved.source === 'kroger' ? { name: saved.regularName, price: saved.regularPrice, size: saved.regularSize } : null;
        showResults(picked ? [picked] : []);
        setSearchNote('');
        modal.hidden = false;
        document.body.style.overflow = 'hidden';
        showPane(saved.source || 'kroger');
        gfSizeInput.focus();
    }
    function close() {
        modal.hidden = true;
        document.body.style.overflow = '';
        askNumber += 1;
        clearTimeout(typingTimer);
        if (current && current.opener && current.opener.isConnected)
            current.opener.focus();
        current = null;
    }
    function showPane(name) {
        source = name;
        tabs.forEach((tab) => {
            const on = tab.dataset.pane === name;
            tab.classList.toggle('active', on);
            tab.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        Object.keys(panes).forEach((key) => { panes[key].hidden = key !== name; });
        updateStoreLinks();
        calculate();
    }
    function setSearchNote(text) {
        searchNote.textContent = text;
        searchNote.hidden = !text;
    }
    // The "look it up" links search each store's own website for the same words
    function updateStoreLinks() {
        const words = encodeURIComponent(manualName.value.trim() || termInput.value.trim());
        el('compareLinkWalmart').href = 'https://www.walmart.com/search?q=' + words;
        el('compareLinkTarget').href = 'https://www.target.com/s?searchTerm=' + words;
        el('compareLinkCostco').href = 'https://www.costco.com/CatalogSearch?keyword=' + words;
    }
    /* ---------- Kroger lookup ---------- */
    async function search() {
        const term = termInput.value.trim();
        const zip = zipInput.value.trim();
        if (!term) {
            setSearchNote('Type what to search for, like "white bread".');
            termInput.focus();
            return;
        }
        if (!/^\d{5}$/.test(zip)) {
            setSearchNote('Type a 5-digit zip code.');
            zipInput.focus();
            return;
        }
        try {
            localStorage.setItem(ZIP_STORAGE_KEY, zip);
        }
        catch (e) { /* storage unavailable */ }
        picked = null;
        showResults([]);
        calculate();
        setSearchNote('Searching…');
        searchBtn.disabled = true;
        try {
            const response = await fetch(current.apiBase + '/kroger/search?zip=' + zip + '&term=' + encodeURIComponent(term));
            if (response.status === 404)
                setSearchNote('No Kroger-family store is near that zip code. Use "Type it in" instead.');
            else if (!response.ok)
                setSearchNote('Kroger could not be reached right now. Try again, or use "Type it in".');
            else {
                const found = (await response.json()).results;
                showResults(found);
                setSearchNote(found.length ? 'Pick the one closest to your gluten-free item.' : 'Nothing found. Try simpler words, like "bread".');
            }
        }
        catch (error) {
            // fetch throws when nothing answers at apiBase (the Python server is off)
            setSearchNote('The price server is not running, so Kroger can’t be searched. Use "Type it in" instead.');
        }
        searchBtn.disabled = false;
    }
    function showResults(products) {
        results.textContent = '';
        products.forEach((product) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'compare-result';
            button.setAttribute('role', 'radio');
            const chosen = picked !== null && picked.name === product.name && picked.price === product.price;
            button.setAttribute('aria-checked', chosen ? 'true' : 'false');
            const name = document.createElement('span');
            name.className = 'compare-result-name';
            name.textContent = product.name;
            const detail = document.createElement('span');
            detail.className = 'compare-result-detail';
            detail.textContent = (product.size || 'size not listed') + ' · ' + money(product.price);
            button.appendChild(name);
            button.appendChild(detail);
            button.addEventListener('click', () => {
                picked = product;
                results.querySelectorAll('.compare-result').forEach((other) => other.setAttribute('aria-checked', other === button ? 'true' : 'false'));
                calculate();
            });
            results.appendChild(button);
        });
    }
    /* ---------- The math (done by the server) ---------- */
    // The regular product on screen right now, or null when one hasn't been chosen or typed yet
    function regularChoice() {
        if (source === 'none')
            return { name: null, price: null, size: null };
        if (source === 'kroger')
            return picked;
        const price = toPrice(manualPrice.value);
        if (!String(manualPrice.value).trim() || !Number.isFinite(price) || price <= 0)
            return null;
        return { name: manualName.value.trim() || 'Regular version', price: Math.round(price * 100) / 100, size: manualSize.value.trim() };
    }
    async function calculate() {
        const myAsk = ++askNumber;
        outcome = null;
        saveBtn.disabled = true;
        if (!current)
            return;
        const line = current.line;
        const apiBase = current.apiBase;
        const regular = regularChoice();
        const quantity = Math.round(Number(quantityInput.value));
        if (!regular || !(quantity >= 1 && quantity <= 99)) {
            outcomeBox.hidden = true;
            return;
        }
        const params = new URLSearchParams({ gf_price: line.price, gf_size: gfSizeInput.value.trim(), quantity: quantity });
        if (source !== 'none') {
            params.set('regular_price', regular.price);
            params.set('regular_size', regular.size || '');
        }
        let answer = null;
        let refused = '';
        try {
            const response = await fetch(apiBase + '/deduction?' + params.toString());
            if (response.ok)
                answer = await response.json();
            else
                refused = (await response.json()).detail;
        }
        catch (error) { /* the server is off; handled just below */ }
        if (myAsk !== askNumber)
            return; // the user changed something while we waited
        if (!answer) {
            const reason = typeof refused === 'string' && refused ? refused : 'The price server did not answer. Make sure it is running, then try again.';
            showOutcome('warn', 'Could not work this out', [reason]);
            return;
        }
        outcome = {
            source: source,
            gfSize: gfSizeInput.value.trim(),
            quantity: quantity,
            term: termInput.value.trim(),
            regularName: regular.name,
            regularPrice: regular.price,
            regularSize: regular.size || '',
            scaledRegularPrice: answer.scaled_regular_price,
            deduction: answer.deduction,
            sizesComparable: answer.sizes_comparable,
            warnings: answer.warnings
        };
        // With no regular version there is no math to show; the server's note already says why
        const lines = source === 'none' ? answer.warnings : [explain(outcome, line.price)].concat(answer.warnings);
        showOutcome(answer.warnings.length ? 'warn' : 'ok', money(answer.deduction) + ' extra cost', lines);
        saveBtn.disabled = false;
    }
    // One plain sentence showing where the number came from
    function explain(o, linePrice) {
        const each = linePrice / o.quantity;
        let text = 'Regular version: ' + money(o.regularPrice) + (o.regularSize ? ' for ' + o.regularSize : '');
        if (o.sizesComparable)
            text += ', which is ' + money(o.scaledRegularPrice) + ' for ' + o.gfSize;
        text += '. ' + money(each) + ' − ' + money(o.scaledRegularPrice) + ' = ' + money(Math.max(each - o.scaledRegularPrice, 0));
        if (o.quantity > 1)
            text += ' each, times ' + o.quantity;
        return text + '.';
    }
    function showOutcome(kind, headline, lines) {
        outcomeBox.hidden = false;
        outcomeBox.className = 'compare-outcome ' + kind;
        outcomeBox.textContent = '';
        const strong = document.createElement('strong');
        strong.textContent = headline;
        outcomeBox.appendChild(strong);
        lines.forEach((line) => {
            const p = document.createElement('p');
            p.textContent = line;
            outcomeBox.appendChild(p);
        });
    }
    // Typing recalculates after a short pause, so the number doesn't flicker on every key
    function calculateSoon() {
        clearTimeout(typingTimer);
        typingTimer = setTimeout(calculate, 350);
    }
    /* ---------- Wiring ---------- */
    tabs.forEach((tab) => tab.addEventListener('click', () => showPane(tab.dataset.pane)));
    searchBtn.addEventListener('click', search);
    [termInput, zipInput].forEach((input) => input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            search();
        }
    }));
    [gfSizeInput, quantityInput, manualName, manualPrice, manualSize].forEach((input) => input.addEventListener('input', calculateSoon));
    [termInput, manualName].forEach((input) => input.addEventListener('input', updateStoreLinks));
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!outcome || !current)
            return;
        const now = new Date();
        // The day the regular price was looked up, kept as part of the record
        outcome.date = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
        const onSave = current.onSave;
        const finished = outcome;
        close();
        onSave(finished);
    });
    el('compareCancel').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal)
        close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden)
        close(); });
    window.BreadWinner = window.BreadWinner || {};
    window.BreadWinner.openCompare = open;
})();
