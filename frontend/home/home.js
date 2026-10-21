// @ts-nocheck
/* ============================================
   BreadWinner — Dashboard JS
   ============================================ */
(function () {
    'use strict';
    /* ---------- User profile ---------- */
    const storedName = (function () {
        try {
            return localStorage.getItem('breadwinner_user_name') || '';
        }
        catch (e) {
            return '';
        }
    })();
    function getInitials(name) {
        const parts = name.trim().split(/\s+/).filter(Boolean);
        if (!parts.length)
            return 'JM';
        const first = parts[0].charAt(0).toUpperCase();
        const last = parts.length > 1 ? parts[parts.length - 1].charAt(0).toUpperCase() : '';
        return first + last;
    }
    const avatarEl = document.querySelector('.avatar-circle');
    if (avatarEl) {
        avatarEl.textContent = getInitials(storedName);
    }
    const welcomeHeading = document.querySelector('.dash-header h1');
    if (welcomeHeading && storedName) {
        const firstName = storedName.trim().split(/\s+/)[0];
        welcomeHeading.textContent = 'Welcome back, ' + firstName + '!';
    }
    /* ---------- Receipt data ---------- */
    // Signed in with an account (cloud.js): receipts live in the database and are loaded at the bottom of this file.
    // Demo mode (no database connected): receipts live in this browser's localStorage.
    const cloud = window.BreadWinner.cloud;
    const RECEIPTS_STORAGE_KEY = 'breadwinner_receipts';
    function loadReceipts() {
        try {
            const stored = JSON.parse(localStorage.getItem(RECEIPTS_STORAGE_KEY) || '[]');
            return Array.isArray(stored) ? stored : [];
        }
        catch (e) {
            return [];
        }
    }
    // receipt = the one that changed (the database saves just that one; demo mode saves them all)
    function saveReceipts(receipt) {
        if (cloud.enabled) {
            cloud.saveReceipt(receipt).catch((error) => toast('Not saved to your account: ' + error.message));
            return;
        }
        try {
            localStorage.setItem(RECEIPTS_STORAGE_KEY, JSON.stringify(RECEIPTS));
        }
        catch (e) { /* storage unavailable */ }
    }
    const RECEIPTS = cloud.enabled ? [] : loadReceipts();
    const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const money = (n) => '$' + n.toFixed(2);
    function animateMetric(id, target, format, delay) {
        // From-scratch odometer (no libraries): each digit is a 1em-tall window
        // over a vertical 0-9 reel. Rolling = translateY the reel; edges are
        // softened with a mask fade + frosted blur strips (see home.css).
        const element = document.getElementById(id);
        if (!element)
            return;
        const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const label = format === 'money' ? (Number(target).toFixed(2) + ' dollars') : String(target);
        const fixed = format === 'money' ? Number(target).toFixed(2) : String(Math.round(Number(target)));
        const parts = fixed.split('.');
        const digits = parts.join('');
        const decimals = parts.length > 1 ? parts[1].length : 0;
        // Build (or reuse) the reel structure once per digit-shape.
        const key = (format === 'money' ? '$' : '') + '|' + digits.length + '|' + decimals;
        if (element.getAttribute('data-layout') !== key) {
            element.setAttribute('data-layout', key);
            element.innerHTML = '';
            const frag = document.createDocumentFragment();
            if (format === 'money') {
                const pre = document.createElement('span');
                pre.className = 'odo-static' + (id === 'totalOvercharge' ? ' odo-currency' : '');
                pre.textContent = '$';
                frag.appendChild(pre);
            }
            const intLen = digits.length - decimals;
            for (let i = 0; i < digits.length; i++) {
                if (decimals && i === intLen) {
                    const dot = document.createElement('span');
                    dot.className = 'odo-static';
                    dot.textContent = '.';
                    frag.appendChild(dot);
                }
                const win = document.createElement('span');
                win.className = 'odo-digit';
                win.setAttribute('aria-hidden', 'true');
                const reel = document.createElement('span');
                reel.className = 'odo-reel';
                for (let d = 0; d <= 9; d++) {
                    const cell = document.createElement('span');
                    cell.textContent = String(d);
                    reel.appendChild(cell);
                }
                reel.style.transform = 'translateY(0.12em)'; // pinned at 0 before the roll (0.12em centers in the 1.24em window)
                win.appendChild(reel);
                frag.appendChild(win);
            }
            element.appendChild(frag);
        }
        const reels = element.querySelectorAll('.odo-reel');
        setTimeout(() => {
            for (let i = 0; i < reels.length; i++) {
                const reel = reels[i];
                // Reel strip is 10 digits tall (10em), so % would resolve against the
                // whole strip — offset in em instead: digit N sits N em down, plus
                // 0.12em to center it in the taller 1.24em window.
                const end = 0.12 - Number(digits[i]);
                if (reduceMotion) {
                    reel.classList.remove('rolling');
                    reel.style.transform = 'translateY(' + end + 'em)';
                    continue;
                }
                reel.classList.remove('rolling');
                reel.style.transform = 'translateY(0.12em)'; // start from 0 every time
                void reel.offsetHeight; // reflow: commit the start position
                reel.classList.add('rolling');
                reel.style.transform = 'translateY(' + end + 'em)';
            }
            element.setAttribute('aria-label', label);
        }, reduceMotion ? 0 : delay);
    }
    // The dashboard numbers are added up from the saved receipts, so they are always real.
    // animate = true staggers the four rolls (page load); false updates them all at once.
    function updateMetrics(animate) {
        const total = Math.round(RECEIPTS.reduce((sum, receipt) => sum + (receipt.overcharge || 0), 0) * 100) / 100;
        const gfItems = RECEIPTS.reduce((sum, receipt) => sum + (receipt.gfItems || 0), 0);
        const average = RECEIPTS.length ? total / RECEIPTS.length : 0;
        animateMetric('totalOvercharge', total, 'money', animate ? 150 : 0);
        animateMetric('receiptsCount', RECEIPTS.length, 'int', animate ? 300 : 0);
        animateMetric('gfItemsCount', gfItems, 'int', animate ? 450 : 0);
        animateMetric('averageOvercharge', average, 'money', animate ? 600 : 0);
    }
    updateMetrics(true);
    const table = document.getElementById('receiptTable');
    const template = document.getElementById('rowTemplate');
    const searchInput = document.getElementById('receiptSearch');
    const sortSelect = document.getElementById('sortSelect');
    const suggest = window.BreadWinner.suggest; // suggest.js: fills in comparisons for the user to approve
    // receipt -> its row on screen, so a suggestion that arrives late can redraw the right row
    const ROW_PARTS = new WeakMap();
    function buildRow(receipt) {
        const frag = template.content.cloneNode(true);
        const row = frag.querySelector('.receipt-row');
        const expand = frag.querySelector('.receipt-expand');
        const nameText = frag.querySelector('.cell-name-text');
        nameText.textContent = receipt.name;
        // Renaming: the box inside the open receipt. "change" fires when the user presses Enter or clicks away.
        const renameInput = frag.querySelector('.rename-input');
        renameInput.value = receipt.name;
        renameInput.addEventListener('change', () => {
            // An empty name goes back to the default instead of leaving a blank row
            const newName = renameInput.value.trim() || 'Captured Receipt';
            renameInput.value = newName;
            if (newName === receipt.name)
                return;
            receipt.name = newName;
            nameText.textContent = newName;
            saveReceipts(receipt);
            toast('Renamed to “' + newName + '”');
        });
        renameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter')
            renameInput.blur(); });
        frag.querySelector('.cell-date').textContent = dateFormatter.format(new Date(receipt.date + 'T00:00'));
        if (receipt.imageUrl) {
            frag.querySelector('.expand-receipt-img').src = receipt.imageUrl;
        }
        ROW_PARTS.set(receipt, { row, expand });
        renderLines(receipt, row, expand);
        // Typing in an item the scanner missed
        const addForm = frag.querySelector('.add-item-form');
        addForm.addEventListener('submit', (e) => {
            e.preventDefault();
            addLine(receipt, row, expand);
        });
        // A closed receipt can't be tabbed into
        expand.inert = true;
        row.addEventListener('click', () => toggleRow(row, expand));
        row.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleRow(row, expand);
            }
        });
        // stopPropagation keeps a press on the trash button from also opening the row
        const deleteBtn = frag.querySelector('.row-delete-btn');
        deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); askToDeleteReceipt(receipt, deleteBtn); });
        deleteBtn.addEventListener('keydown', (e) => e.stopPropagation());
        return frag;
    }
    /* ---------- The items inside one receipt ---------- */
    // Draws the item list. Called again after every add or remove, so the screen always matches what is saved.
    function renderLines(receipt, row, expand) {
        const list = expand.querySelector('.expand-item-list');
        list.textContent = '';
        receipt.lines.forEach((line) => {
            const li = document.createElement('li');
            // The circle shows our gluten-free guess. Pressing it is how the user corrects the guess.
            const mark = document.createElement('button');
            mark.type = 'button';
            mark.className = 'item-mark ' + (line.gf === null ? 'unknown' : line.gf ? 'yes' : 'no');
            mark.setAttribute('aria-pressed', line.gf ? 'true' : 'false');
            mark.setAttribute('aria-label', line.name + (line.gf ? ': gluten-free. Press if it is not.' : ': not marked gluten-free. Press if it is.'));
            mark.title = line.gf ? (line.gfReason || 'Marked gluten-free') + '. Press if it is not.' : 'Press if this is a gluten-free product';
            mark.innerHTML = line.gf === null ? '?' : line.gf
                ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
                : '';
            mark.addEventListener('click', () => {
                line.gf = !line.gf;
                if (line.gf && !line.gfReason)
                    line.gfReason = 'Marked gluten-free by you';
                // An item bought before at the same price gets its earlier comparison back as a suggestion
                if (line.gf && !line.compare && !line.draft) {
                    const remembered = suggest.recall(line, RECEIPTS);
                    if (remembered)
                        line.draft = remembered;
                }
                // A saved comparison is kept but only counted while the item is marked gluten-free,
                // so a mis-tap on the circle loses nothing
                saveLines(receipt, row, expand);
                focusLine(receipt, expand, line, '.item-mark');
            });
            const name = document.createElement('span');
            name.className = 'item-name';
            name.textContent = line.name;
            if (line.plainName && line.plainName.toLowerCase() !== line.name.toLowerCase()) {
                // The receipt's own text stays the record. The plain-English guess only helps reading it.
                const plain = document.createElement('span');
                plain.className = 'item-plain';
                plain.textContent = line.plainName;
                name.appendChild(plain);
            }
            const badges = document.createElement('span');
            badges.className = 'item-badges';
            if (line.gf) {
                // A suggested comparison waiting for the user. It counts for nothing until it is approved.
                const draft = line.compare ? null : line.draft;
                if (draft) {
                    const note = document.createElement('span');
                    note.className = 'item-plain';
                    note.textContent = describeDraft(draft);
                    name.appendChild(note);
                    const approveBtn = document.createElement('button');
                    approveBtn.type = 'button';
                    approveBtn.className = 'badge badge-compare badge-approve';
                    approveBtn.textContent = 'Approve +' + money(draft.deduction);
                    approveBtn.setAttribute('aria-label', 'Approve ' + money(draft.deduction) + ' overcharge for ' + line.name);
                    approveBtn.title = draft.warnings.concat('Press to count this suggestion.').join(' ');
                    approveBtn.addEventListener('click', () => {
                        approve(line);
                        saveLines(receipt, row, expand);
                        focusLine(receipt, expand, line, '.badge-tax');
                        toast('Saved. ' + money(line.compare.deduction) + ' counted for ' + line.name);
                    });
                    badges.appendChild(approveBtn);
                }
                const b = document.createElement('button');
                b.type = 'button';
                if (line.compare) {
                    b.className = 'badge badge-tax' + (line.compare.warnings.length ? ' badge-check' : '');
                    b.textContent = '+' + money(line.compare.deduction) + ' overcharge';
                    b.title = line.compare.warnings.concat('Press to change the comparison.').join(' ');
                }
                else if (draft) {
                    b.className = 'badge badge-change';
                    b.textContent = 'Change';
                    b.setAttribute('aria-label', 'Change the suggestion for ' + line.name);
                    b.title = 'Pick a different product, size or price';
                }
                else {
                    b.className = 'badge badge-compare';
                    b.textContent = 'Compare price';
                    b.title = 'Find what the regular version costs';
                }
                b.addEventListener('click', () => window.BreadWinner.openCompare({
                    line,
                    apiBase: API_BASE,
                    opener: b,
                    onSave: (compare) => {
                        line.compare = compare;
                        delete line.draft;
                        saveLines(receipt, row, expand);
                        focusLine(receipt, expand, line, '.badge-tax');
                        toast('Saved. ' + money(compare.deduction) + ' counted for ' + line.name);
                    }
                }));
                badges.appendChild(b);
            }
            if (line.added) {
                const b = document.createElement('span');
                b.className = 'badge badge-added';
                b.textContent = 'Added by you';
                badges.appendChild(b);
            }
            if (line.unsure) {
                // The scanner was not confident about this line. Pressing the tag says "I checked, it's right".
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'badge badge-unsure';
                b.textContent = 'Hard to read · mark OK';
                b.title = 'The scanner was not sure about this line. Compare it with the photo, then press here if it is right, or remove it and add it again.';
                b.addEventListener('click', () => { line.unsure = false; saveLines(receipt, row, expand); });
                badges.appendChild(b);
            }
            const price = document.createElement('span');
            price.className = 'item-price';
            price.textContent = money(line.price);
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'item-remove-btn';
            removeBtn.setAttribute('aria-label', 'Remove ' + line.name);
            removeBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
            removeBtn.addEventListener('click', () => {
                receipt.lines.splice(receipt.lines.indexOf(line), 1);
                saveLines(receipt, row, expand);
                toast('Removed ' + line.name);
            });
            li.appendChild(mark);
            li.appendChild(name);
            li.appendChild(badges);
            li.appendChild(price);
            li.appendChild(removeBtn);
            list.appendChild(li);
        });
        showRowTotals(receipt, row, expand);
        showItemsCheck(receipt, expand);
        showSuggestBar(receipt, row, expand);
    }
    /* ---------- Suggested comparisons (see suggest.js) ---------- */
    // Turns a suggestion into a saved comparison. Only ever called by a press from the user.
    function approve(line) {
        const compare = Object.assign({}, line.draft);
        delete compare.from; // these two only describe the suggestion,
        delete compare.sizeGuessed; // and the user has now checked it
        line.compare = compare;
        delete line.draft;
    }
    // One plain sentence saying where a suggestion came from, so the user knows what they are approving
    function describeDraft(draft) {
        let text = 'Suggested: ';
        if (draft.source === 'none')
            text += 'no regular version exists, so the whole price counts';
        else {
            text += 'compared with ' + draft.regularName + ' (' + (draft.regularSize ? draft.regularSize + ', ' : '')
                + money(draft.regularPrice) + (draft.source === 'kroger' ? ' at the nearest Kroger-family store' : '') + ')';
        }
        if (draft.quantity > 1)
            text += ', for ' + draft.quantity + ' packages';
        if (draft.from === 'memory')
            text += '. Same as you chose on ' + dateFormatter.format(new Date(draft.date + 'T00:00'));
        else if (draft.sizeGuessed)
            text += '. Your package size (' + draft.gfSize + ') is from Kroger’s listing, so check it';
        else if (!draft.sizesComparable)
            text += '. Press Change to add your package size for a fairer number';
        return text + '.';
    }
    // Fills in a suggestion for every gluten-free line that has no comparison yet: first from the
    // user's own earlier receipts, then from Kroger when a zip code is known.
    async function makeDrafts(receipt) {
        const zip = suggest.getZip();
        let made = 0;
        let problem = '';
        await Promise.all(receipt.lines.map(async (line) => {
            if (!line.gf || line.compare || line.draft)
                return;
            let draft = suggest.recall(line, RECEIPTS);
            if (!draft && zip && line.regularTerm) {
                const answer = await suggest.askKroger(line, zip, API_BASE);
                draft = answer.draft;
                problem = problem || answer.problem;
            }
            // The user may have compared this line by hand while Kroger was answering
            if (draft && !line.compare) {
                line.draft = draft;
                made += 1;
            }
        }));
        return { made, problem };
    }
    // The strip above the items: how many suggestions are waiting, and a way to ask Kroger for more
    function showSuggestBar(receipt, row, expand) {
        const bar = expand.querySelector('.suggest-bar');
        const drafts = receipt.lines.filter((line) => line.gf && !line.compare && line.draft);
        const canAsk = receipt.lines.some((line) => line.gf && !line.compare && !line.draft && line.regularTerm);
        bar.textContent = '';
        bar.hidden = !drafts.length && !canAsk;
        if (drafts.length) {
            const text = document.createElement('p');
            text.textContent = drafts.length === 1
                ? '1 suggested price is waiting. It only counts after you approve it.'
                : drafts.length + ' suggested prices are waiting. They only count after you approve them.';
            bar.appendChild(text);
        }
        if (drafts.length > 1) {
            const all = document.createElement('button');
            all.type = 'button';
            all.className = 'btn btn-primary btn-sm';
            all.textContent = 'Approve all ' + drafts.length;
            all.addEventListener('click', () => {
                drafts.forEach((line) => approve(line));
                const counted = drafts.reduce((sum, line) => sum + line.compare.deduction, 0);
                saveLines(receipt, row, expand);
                toast('Approved ' + drafts.length + ' suggestions. ' + money(counted) + ' counted.');
                const next = expand.querySelector('.badge-tax');
                if (next)
                    next.focus();
            });
            bar.appendChild(all);
        }
        if (canAsk) {
            if (!drafts.length) {
                const text = document.createElement('p');
                text.textContent = 'Want a head start? We can suggest each regular price from the Kroger-family store nearest you.';
                bar.appendChild(text);
            }
            const form = document.createElement('form');
            form.className = 'suggest-form';
            form.noValidate = true;
            const zipInput = document.createElement('input');
            zipInput.type = 'text';
            zipInput.inputMode = 'numeric';
            zipInput.maxLength = 5;
            zipInput.placeholder = 'Zip code';
            zipInput.setAttribute('aria-label', 'Zip code');
            zipInput.autocomplete = 'postal-code';
            zipInput.value = suggest.getZip();
            const askBtn = document.createElement('button');
            askBtn.type = 'submit';
            askBtn.className = 'btn btn-secondary btn-sm';
            askBtn.textContent = 'Suggest prices';
            form.appendChild(zipInput);
            form.appendChild(askBtn);
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const zip = zipInput.value.trim();
                if (!/^\d{5}$/.test(zip)) {
                    toast('Type a 5-digit zip code.');
                    zipInput.focus();
                    return;
                }
                suggest.setZip(zip);
                askBtn.disabled = true;
                askBtn.textContent = 'Looking…';
                const result = await makeDrafts(receipt);
                saveLines(receipt, row, expand); // redraws the list, and this strip with it
                if (result.made)
                    toast(result.made === 1 ? '1 price suggested. Check it, then approve.' : result.made + ' prices suggested. Check them, then approve.');
                else
                    toast(result.problem || 'Nothing to suggest for these items. Use “Compare price” instead.');
                const next = expand.querySelector('.badge-approve, .suggest-form input');
                if (next)
                    next.focus();
            });
            bar.appendChild(form);
        }
    }
    // Redrawing the list replaces every button, so keyboard focus is put back on the line just changed
    function focusLine(receipt, expand, line, selector) {
        const li = expand.querySelectorAll('.expand-item-list li')[receipt.lines.indexOf(line)];
        const target = li && li.querySelector(selector);
        if (target)
            target.focus();
    }
    // Adds up one receipt from its lines. Run after every change, so the saved totals never go stale.
    function tally(receipt) {
        const gfLines = receipt.lines.filter((line) => line.gf);
        const overcharge = gfLines.reduce((sum, line) => sum + (line.compare ? line.compare.deduction : 0), 0);
        // Still needs the user when a line was hard to read, or a gluten-free item has no comparison yet
        const waiting = receipt.lines.some((line) => line.unsure || (line.gf && !line.compare));
        receipt.items = receipt.lines.length;
        receipt.gfItems = gfLines.length;
        receipt.overcharge = Math.round(overcharge * 100) / 100;
        receipt.status = waiting ? 'review' : 'processed';
    }
    // The numbers in the table row, and the total under the item list
    function showRowTotals(receipt, row, expand) {
        row.querySelector('.cell-items').textContent = receipt.items;
        row.querySelector('.cell-gf').textContent = receipt.gfItems;
        const overchargeCell = row.querySelector('.cell-overcharge');
        overchargeCell.textContent = receipt.overcharge > 0 ? money(receipt.overcharge) : '—';
        overchargeCell.classList.toggle('zero', !(receipt.overcharge > 0));
        const statusCell = row.querySelector('.cell-status');
        statusCell.textContent = '';
        const pill = document.createElement('span');
        pill.className = 'status-pill ' + (receipt.status === 'processed' ? 'status-processed' : 'status-review');
        pill.textContent = receipt.status === 'processed' ? 'Processed' : 'Needs Review';
        statusCell.appendChild(pill);
        const total = expand.querySelector('.receipt-total');
        total.hidden = !receipt.gfItems;
        total.textContent = 'Overcharge counted on this receipt: ' + money(receipt.overcharge || 0)
            + '. An organized estimate, not tax advice. Confirm with a tax professional.';
    }
    // Many receipts print a subtotal. If the items don't add up to it, a line is missing or a price was misread.
    function showItemsCheck(receipt, expand) {
        const note = expand.querySelector('.items-check');
        if (typeof receipt.subtotal !== 'number') {
            note.hidden = true;
            return;
        }
        const itemsTotal = receipt.lines.reduce((sum, line) => sum + line.price, 0);
        const addsUp = Math.abs(itemsTotal - receipt.subtotal) < 0.005;
        note.hidden = false;
        note.className = 'items-check ' + (addsUp ? 'ok' : 'warn');
        note.textContent = addsUp
            ? 'These items add up to the subtotal printed on the receipt (' + money(receipt.subtotal) + ').'
            : 'These items add up to ' + money(itemsTotal) + ', but the receipt’s subtotal says ' + money(receipt.subtotal)
                + '. An item may be missing or a price misread. Compare with the photo, then remove or add items below.';
    }
    function saveLines(receipt, row, expand) {
        tally(receipt);
        saveReceipts(receipt);
        renderLines(receipt, row, expand);
        updateMetrics(false);
    }
    function addLine(receipt, row, expand) {
        const nameInput = expand.querySelector('.add-item-name');
        const priceInput = expand.querySelector('.add-item-price');
        const error = expand.querySelector('.add-item-error');
        const name = nameInput.value.trim();
        // Accepts "4.99", "$4.99" and "4,99"
        const price = Number(priceInput.value.trim().replace(/\$/g, '').replace(',', '.'));
        let problem = '';
        if (!name)
            problem = 'Type the item’s name.';
        else if (!priceInput.value.trim() || !Number.isFinite(price) || price <= 0)
            problem = 'Type the price as a number, like 4.99.';
        error.textContent = problem;
        error.hidden = !problem;
        if (problem) {
            (name ? priceInput : nameInput).focus();
            return;
        }
        // gf: null means "not checked yet". added: true keeps typed-in items apart from scanned ones.
        receipt.lines.push({ name, price: Math.round(price * 100) / 100, gf: null, tax: false, added: true });
        saveLines(receipt, row, expand);
        nameInput.value = '';
        priceInput.value = '';
        nameInput.focus(); // ready for the next item
    }
    /* ---------- Delete a receipt (asks first) ---------- */
    const deleteModal = document.getElementById('deleteReceiptModal');
    const deleteCancelBtn = document.getElementById('deleteReceiptCancel');
    const deleteConfirmBtn = document.getElementById('deleteReceiptConfirm');
    let receiptToDelete = null;
    let deleteOpenedFrom = null;
    function askToDeleteReceipt(receipt, button) {
        receiptToDelete = receipt;
        deleteOpenedFrom = button;
        deleteModal.hidden = false;
        document.body.style.overflow = 'hidden';
        deleteCancelBtn.focus();
    }
    function closeDeleteModal() {
        deleteModal.hidden = true;
        document.body.style.overflow = '';
        receiptToDelete = null;
        // Put keyboard focus back where it was (if that row still exists)
        if (deleteOpenedFrom && deleteOpenedFrom.isConnected)
            deleteOpenedFrom.focus();
        deleteOpenedFrom = null;
    }
    function deleteReceipt() {
        const index = RECEIPTS.indexOf(receiptToDelete);
        if (index !== -1) {
            RECEIPTS.splice(index, 1);
            if (cloud.enabled)
                cloud.deleteReceipt(receiptToDelete).catch((error) => toast('Not deleted from your account: ' + error.message));
            else
                saveReceipts();
            applyFilters();
            updateMetrics(false);
            toast('Receipt deleted');
        }
        closeDeleteModal();
    }
    if (deleteModal) {
        deleteCancelBtn.addEventListener('click', closeDeleteModal);
        deleteConfirmBtn.addEventListener('click', deleteReceipt);
        deleteModal.addEventListener('click', (e) => { if (e.target === deleteModal)
            closeDeleteModal(); });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !deleteModal.hidden)
                closeDeleteModal();
        });
    }
    function toggleRow(row, expand) {
        const isOpen = row.classList.toggle('open');
        expand.classList.toggle('open', isOpen);
        expand.inert = !isOpen;
        const btn = row.querySelector('.row-expand-btn');
        btn.setAttribute('aria-label', isOpen ? 'Collapse receipt details' : 'Expand receipt details');
    }
    function render(list) {
        table.querySelectorAll('.receipt-row:not(.receipt-row-head), .receipt-expand, .receipt-empty').forEach((el) => el.remove());
        if (!list.length) {
            const empty = document.createElement('div');
            empty.className = 'receipt-empty';
            empty.textContent = 'No receipts yet! Click the green + button to upload or take a photo of a receipt.';
            table.appendChild(empty);
            return;
        }
        list.forEach((r) => table.appendChild(buildRow(r)));
    }
    function applyFilters() {
        const query = (searchInput.value || '').toLowerCase().trim();
        let list = RECEIPTS.filter((r) => r.name.toLowerCase().includes(query));
        switch (sortSelect.value) {
            case 'oldest':
                list = list.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
                break;
            case 'savings':
                list = list.slice().sort((a, b) => b.overcharge - a.overcharge);
                break;
            case 'items':
                list = list.slice().sort((a, b) => b.items - a.items);
                break;
            default: // newest
                list = list.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
        }
        render(list);
    }
    if (table && template) {
        render(RECEIPTS);
        searchInput.addEventListener('input', applyFilters);
        sortSelect.addEventListener('change', applyFilters);
    }
    if (window.BreadWinner && window.BreadWinner.staggerReveal) {
        window.BreadWinner.staggerReveal('.summary-panel', 80);
    }
    /* ---------- Camera workspace ---------- */
    const photoBtn = document.getElementById('fabUpload');
    const fileInput = document.getElementById('fileInput');
    const cameraOverlay = document.getElementById('cameraOverlay');
    const cameraVideo = document.getElementById('cameraVideo');
    const cameraCanvas = document.getElementById('cameraCanvas');
    const cameraViewport = document.getElementById('cameraViewport');
    const cameraPlaceholder = document.getElementById('cameraPlaceholder');
    const cameraCaptureBtn = document.getElementById('cameraCaptureBtn');
    const cameraPreview = document.getElementById('cameraPreview');
    const cameraPreviewImg = document.getElementById('cameraPreviewImg');
    const cameraClose = document.getElementById('cameraClose');
    const cameraRetakeBtn = document.getElementById('cameraRetakeBtn');
    const cameraConfirmBtn = document.getElementById('cameraConfirmBtn');
    const cameraFooter = document.getElementById('cameraFooter');
    const cameraStatus = document.getElementById('cameraStatus');
    const cameraFlash = document.getElementById('cameraFlash');
    const scanGuide = document.getElementById('scanGuide');
    let mediaStream = null;
    let capturedBlob = null;
    let streamReady = false;
    let previewUrl = null;
    let cameraRequestId = 0;
    function setCameraLoading() {
        cameraPlaceholder.hidden = false;
        cameraPlaceholder.innerHTML = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none"><path d="M23 19a2 2 0 01-2-2V8a2 2 0 00-2-2h-4l-2-3h-6L7 6H3a2 2 0 00-2 2v11a2 2 0 002 2h16a2 2 0 002-2Z" stroke="#6B7280" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="13" r="4" stroke="#6B7280" stroke-width="1.8"/></svg><p>Requesting camera access...</p>';
        if (cameraStatus) {
            cameraStatus.textContent = 'Requesting access…';
            cameraStatus.classList.remove('live');
        }
    }
    function setCameraError(message) {
        cameraVideo.hidden = true;
        cameraFooter.hidden = true;
        cameraPreview.hidden = true;
        cameraViewport.hidden = false;
        cameraPlaceholder.hidden = false;
        cameraPlaceholder.innerHTML = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#FBBF24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
            + '<p class="camera-error-title">Camera unavailable</p>'
            + '<p class="camera-error-msg">' + message + '</p>'
            + '<div class="camera-error-actions"><button type="button" class="btn btn-secondary camera-fallback">Use Upload Image</button><button type="button" class="btn btn-primary camera-retry">Try Again</button></div>';
        const retryBtn = cameraPlaceholder.querySelector('.camera-retry');
        if (retryBtn)
            retryBtn.addEventListener('click', (e) => { e.stopPropagation(); startCamera(); });
        const fallbackBtn = cameraPlaceholder.querySelector('.camera-fallback');
        if (fallbackBtn)
            fallbackBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                closeCamera();
                if (fileInput)
                    fileInput.click();
            });
        if (cameraStatus) {
            cameraStatus.textContent = 'Unavailable';
            cameraStatus.classList.remove('live');
        }
    }
    function cameraErrorMessage(err) {
        if (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
            return 'Camera access was denied. Allow camera permissions in your browser settings, then try again.';
        }
        if (err && err.name === 'NotFoundError') {
            return 'No camera was found on this device.';
        }
        if (err && err.name === 'NotReadableError') {
            return 'Your camera is already in use by another app. Close it and try again.';
        }
        return 'This browser cannot access the camera here. Use HTTPS (or localhost) and allow camera permissions.';
    }
    function stopMediaStream() {
        if (!mediaStream)
            return;
        mediaStream.getTracks().forEach((track) => track.stop());
        mediaStream = null;
    }
    async function startCamera() {
        const requestId = ++cameraRequestId;
        stopMediaStream();
        setCameraLoading();
        // Keep the footer visible while loading so "Upload a photo" is always reachable
        cameraFooter.hidden = false;
        cameraPreview.hidden = true;
        if (scanGuide)
            scanGuide.hidden = true;
        cameraCaptureBtn.disabled = true;
        cameraConfirmBtn.disabled = false;
        streamReady = false;
        try {
            if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
                const error = new Error('MediaDevices API unavailable');
                error.name = 'NotSupportedError';
                throw error;
            }
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: false
            });
            if (requestId !== cameraRequestId || cameraOverlay.hidden) {
                stream.getTracks().forEach((track) => track.stop());
                return;
            }
            mediaStream = stream;
            cameraVideo.srcObject = stream;
            cameraVideo.hidden = false;
            cameraPlaceholder.hidden = true;
            cameraVideo.addEventListener('loadedmetadata', enableWhenReady, { once: true });
            cameraVideo.addEventListener('playing', enableWhenReady, { once: true });
            await cameraVideo.play().catch(() => { });
            setTimeout(() => { if (mediaStream === stream)
                enableWhenReady(); }, 1200);
        }
        catch (err) {
            if (requestId !== cameraRequestId || cameraOverlay.hidden)
                return;
            stopMediaStream();
            setCameraError(cameraErrorMessage(err));
        }
    }
    function enableWhenReady() {
        if (streamReady)
            return;
        if (!cameraVideo.videoWidth || !cameraVideo.videoHeight)
            return;
        streamReady = true;
        cameraFooter.hidden = false;
        cameraCaptureBtn.disabled = false;
        if (scanGuide)
            scanGuide.hidden = false;
        if (cameraStatus) {
            cameraStatus.textContent = 'Ready';
            cameraStatus.classList.add('live');
        }
    }
    function stopCamera() {
        cameraRequestId += 1;
        stopMediaStream();
        cameraVideo.srcObject = null;
        cameraVideo.hidden = true;
        cameraViewport.hidden = false;
        streamReady = false;
        cameraCaptureBtn.disabled = true;
        cameraConfirmBtn.disabled = false;
        setCameraLoading();
        cameraFooter.hidden = true;
        cameraPreview.hidden = true;
        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
            previewUrl = null;
        }
        capturedBlob = null;
        if (scanGuide)
            scanGuide.hidden = true;
        if (cameraStatus) {
            cameraStatus.textContent = 'Starting camera…';
            cameraStatus.classList.remove('live');
        }
    }
    function flashShutter() {
        if (!cameraFlash || document.documentElement.getAttribute('data-reduce-motion') === 'true')
            return;
        cameraFlash.hidden = false;
        void cameraFlash.offsetWidth;
        cameraFlash.classList.remove('flash');
        void cameraFlash.offsetWidth;
        cameraFlash.classList.add('flash');
        setTimeout(() => { cameraFlash.hidden = true; cameraFlash.classList.remove('flash'); }, 400);
    }
    function capturePhoto() {
        if (!streamReady || !cameraVideo.videoWidth || !cameraVideo.videoHeight)
            return;
        flashShutter();
        const video = cameraVideo;
        const canvas = cameraCanvas;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
            if (!blob)
                return;
            capturedBlob = blob;
            if (previewUrl)
                URL.revokeObjectURL(previewUrl);
            previewUrl = URL.createObjectURL(blob);
            cameraPreviewImg.src = previewUrl;
            cameraVideo.hidden = true;
            cameraViewport.hidden = true;
            if (scanGuide)
                scanGuide.hidden = true;
            cameraFooter.hidden = true;
            cameraPreview.hidden = false;
            if (cameraStatus) {
                cameraStatus.textContent = 'Captured';
                cameraStatus.classList.remove('live');
            }
        }, 'image/jpeg', 0.92);
    }
    function retakePhoto() {
        capturedBlob = null;
        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
            previewUrl = null;
        }
        // Return to the live feed. If the stream is gone for any reason, restart it.
        if (!mediaStream || !cameraVideo.srcObject) {
            startCamera();
            return;
        }
        cameraPreview.hidden = true;
        cameraViewport.hidden = false;
        cameraVideo.hidden = false;
        cameraFooter.hidden = false;
        if (scanGuide)
            scanGuide.hidden = false;
        if (cameraStatus) {
            cameraStatus.textContent = 'Ready';
            cameraStatus.classList.add('live');
        }
    }
    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.addEventListener('load', () => resolve(reader.result));
            reader.addEventListener('error', reject);
            reader.readAsDataURL(blob);
        });
    }
    function showReceiptHistory() {
        applyFilters();
        updateMetrics(false);
        if (!window.matchMedia('(max-width: 860px)').matches)
            return;
        switchMobileView('receipt');
        const receiptItem = bottomNav && bottomNav.querySelector('[data-nav="receipt"]');
        if (receiptItem) {
            bottomNav.querySelectorAll('.bottom-nav-item').forEach((item) => item.classList.remove('active'));
            receiptItem.classList.add('active');
            positionBottomNavPill(receiptItem);
        }
    }
    /* ---------- Receipt scanning ---------- */
    // Where the Python server lives (set in shared.ts: this computer, or Render)
    const API_BASE = window.BreadWinner.apiBase;
    function toast(message) {
        if (window.BreadWinner && window.BreadWinner.toast)
            window.BreadWinner.toast(message);
    }
    async function scanReceipt(blob) {
        const form = new FormData();
        form.append('file', blob, 'receipt.jpg');
        // The wake-up knock in shared.ts hasn't been answered yet, so this scan will wait for the server to wake
        if (!window.BreadWinner.scannerAwake)
            toast('Waking up the scanner. This can take up to a minute…');
        const response = await fetch(API_BASE + '/scan', { method: 'POST', body: form });
        if (!response.ok)
            throw new Error('Scan failed: ' + response.status);
        return response.json(); // { engine, items, subtotal }
    }
    // Browser storage only holds about 5 MB, so keep a small copy of the photo, not the original
    async function makeThumbnail(blob) {
        try {
            const bitmap = await createImageBitmap(blob);
            const scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(bitmap.width * scale);
            canvas.height = Math.round(bitmap.height * scale);
            canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL('image/jpeg', 0.7);
        }
        catch (error) {
            return blobToDataUrl(blob);
        }
    }
    async function processReceipt(blob) {
        let items = [];
        let subtotal = null;
        let scanProblem = '';
        try {
            const scan = await scanReceipt(blob);
            items = scan.items;
            subtotal = scan.subtotal;
        }
        catch (error) {
            // fetch throws a TypeError when nothing answers at API_BASE (the Python server is off)
            if (error instanceof TypeError)
                scanProblem = 'Photo saved, but the scanner server is not running, so no items were read.';
            else
                scanProblem = 'Photo saved, but that file could not be read as a receipt.';
        }
        const receipt = addReceiptToHistory(await makeThumbnail(blob), items, subtotal);
        // Fill in a suggested comparison for each gluten-free item. The user still approves every one.
        const suggested = (await makeDrafts(receipt)).made;
        if (suggested) {
            const parts = ROW_PARTS.get(receipt);
            if (parts)
                saveLines(receipt, parts.row, parts.expand);
            else
                saveReceipts(receipt);
        }
        const hardToRead = items.filter((item) => item.unsure).length;
        const looksGf = items.filter((item) => item.gf).length;
        const found = 'Found ' + items.length + (items.length === 1 ? ' item' : ' items');
        if (scanProblem)
            toast(scanProblem);
        else if (!items.length)
            toast('No items found. Try a clearer, flatter photo.');
        else if (hardToRead)
            toast(found + '. ' + hardToRead + (hardToRead === 1 ? ' was' : ' were') + ' hard to read. Open the receipt to check.');
        else if (looksGf)
            toast(found + ', ' + looksGf + (looksGf === 1 ? ' looks' : ' look') + ' gluten-free. Open the receipt to '
                + (suggested ? 'approve the suggested prices.' : 'compare prices.'));
        else
            toast(found + '. None looked gluten-free. Open the receipt to check.');
    }
    function addReceiptToHistory(imageUrl, items, subtotal) {
        const now = new Date();
        // Today's date where the user is (toISOString would give the date in London)
        const dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
        const storeName = 'Captured Receipt';
        // gf: the server's guess (true/false) that this is a gluten-free product. The user can flip it.
        // gfReason: why it guessed so. plainName: a plain-English reading of the receipt's short name.
        // regularTerm: what to search for to price the regular version.
        // unsure: true means the scanner was not confident about that line
        // quantity: how many packages the line is for ("2 @ 3.99" is 2)
        const lines = items.map((item) => ({
            name: item.name,
            price: item.price,
            quantity: item.quantity || 1,
            gf: typeof item.gf === 'boolean' ? item.gf : null,
            gfReason: item.gf_reason || null,
            plainName: item.plain_name || null,
            regularTerm: item.regular_term || null,
            unsure: item.unsure === true
        }));
        const newReceipt = {
            name: storeName,
            date: dateStr,
            subtotal, // the subtotal printed on the receipt, or null when the scanner found none
            lines,
            imageUrl
        };
        tally(newReceipt); // fills in items, gfItems, overcharge and status
        RECEIPTS.unshift(newReceipt);
        saveReceipts(newReceipt);
        showReceiptHistory();
        closeCamera();
        const fab = document.getElementById('fabUpload');
        fab.style.background = '#10B981';
        setTimeout(() => { fab.style.background = ''; }, 800);
        return newReceipt;
    }
    async function confirmAndAddReceipt() {
        if (!capturedBlob)
            return;
        cameraConfirmBtn.disabled = true;
        if (cameraStatus)
            cameraStatus.textContent = 'Reading receipt…';
        try {
            await processReceipt(capturedBlob);
        }
        catch (error) {
            if (cameraStatus)
                cameraStatus.textContent = 'Could not save photo';
        }
        cameraConfirmBtn.disabled = false;
    }
    function closeCamera() {
        stopCamera();
        cameraOverlay.hidden = true;
        document.body.style.overflow = '';
    }
    if (photoBtn && cameraOverlay) {
        photoBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            cameraOverlay.hidden = false;
            document.body.style.overflow = 'hidden';
            startCamera();
        });
        cameraClose.addEventListener('click', () => {
            closeCamera();
        });
        cameraOverlay.addEventListener('click', (e) => {
            if (e.target === cameraOverlay) {
                closeCamera();
            }
        });
        cameraCaptureBtn.addEventListener('click', capturePhoto);
        cameraRetakeBtn.addEventListener('click', retakePhoto);
        cameraConfirmBtn.addEventListener('click', confirmAndAddReceipt);
        // Lets people pick a photo they already have instead of using the camera
        const cameraUploadBtn = document.getElementById('cameraUploadBtn');
        if (cameraUploadBtn && fileInput) {
            cameraUploadBtn.addEventListener('click', () => fileInput.click());
        }
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !cameraOverlay.hidden) {
                closeCamera();
            }
        });
    }
    if (fileInput) {
        fileInput.addEventListener('change', async () => {
            const file = fileInput.files && fileInput.files[0];
            fileInput.value = '';
            if (!file)
                return;
            closeCamera();
            toast('Reading receipt…');
            try {
                await processReceipt(file);
            }
            catch (error) {
                console.error('Could not save uploaded receipt:', error);
            }
        });
    }
    /* ---------- Mobile bottom navbar sliding pill ---------- */
    const bottomNav = document.getElementById('mobileBottomNav');
    const bottomNavPill = document.getElementById('bottomNavPill');
    function positionBottomNavPill(item) {
        if (!bottomNavPill || !item)
            return;
        const navRect = bottomNav.getBoundingClientRect();
        const itemRect = item.getBoundingClientRect();
        const pillWidth = bottomNavPill.offsetWidth;
        const itemCenter = itemRect.left + itemRect.width / 2;
        const offset = itemCenter - navRect.left - pillWidth / 2;
        bottomNavPill.style.transform = 'translateX(' + offset + 'px)';
    }
    function initBottomNavPill() {
        if (!bottomNav || !bottomNavPill)
            return;
        // If we landed with #receipts (e.g. from the mobile bottom nav on
        // profile/settings), the pill should sit on Receipts, not Dashboard.
        let activeItem = bottomNav.querySelector('.bottom-nav-item.active');
        const hash = window.location.hash || '';
        if (hash === '#receipts') {
            activeItem = bottomNav.querySelector('.bottom-nav-item[data-nav="receipt"]');
            if (activeItem) {
                bottomNav.querySelectorAll('.bottom-nav-item').forEach((i) => i.classList.remove('active'));
                activeItem.classList.add('active');
            }
        }
        positionBottomNavPill(activeItem || bottomNav.querySelector('.bottom-nav-item'));
        bottomNavPill.classList.add('visible');
    }
    // Show the correct mobile view when landing on the page with a #receipts hash.
    function applyInitialRoute() {
        if (!bottomNav)
            return;
        if ((window.location.hash || '') === '#receipts') {
            // On desktop this is a no-op, leaving the default anchor scroll intact.
            switchMobileView('receipt');
        }
    }
    const dashboardView = document.getElementById('dashboardView');
    const receiptView = document.getElementById('receiptView');
    function switchMobileView(viewName) {
        if (!dashboardView || !receiptView)
            return;
        const isMobile = window.matchMedia('(max-width: 860px)').matches;
        if (!isMobile)
            return;
        if (viewName === 'receipt') {
            dashboardView.hidden = true;
            receiptView.hidden = false;
        }
        else {
            dashboardView.hidden = false;
            receiptView.hidden = true;
        }
        window.scrollTo(0, 0);
    }
    if (bottomNav) {
        bottomNav.querySelectorAll('.bottom-nav-item').forEach((item) => {
            item.addEventListener('click', (e) => {
                // Same-page dashboard / receipts toggles are handled in JS so the
                // receipt view is pulled up as its own screen on mobile (no hash race).
                const nav = item.dataset.nav;
                if (nav === 'dashboard' || nav === 'receipt') {
                    if (window.matchMedia('(max-width: 860px)').matches)
                        e.preventDefault();
                    bottomNav.querySelectorAll('.bottom-nav-item').forEach((i) => i.classList.remove('active'));
                    item.classList.add('active');
                    positionBottomNavPill(item);
                    switchMobileView(nav);
                    return;
                }
                // Other pages (e.g. settings) keep default anchor/navigation.
                bottomNav.querySelectorAll('.bottom-nav-item').forEach((i) => i.classList.remove('active'));
                item.classList.add('active');
                positionBottomNavPill(item);
            });
        });
        // On first load, honor a #receipts hash (view + active pill) so the
        // bottom nav reflects where we landed.
        applyInitialRoute();
        // Only position the pill when the mobile breakpoint is active,
        // since the nav is display:none at desktop width (zero-size rects)
        const mobileQuery = window.matchMedia('(max-width: 860px)');
        function handleMobileChange(e) {
            if (e.matches) {
                requestAnimationFrame(initBottomNavPill);
                setTimeout(initBottomNavPill, 100);
            }
            else {
                bottomNavPill.classList.remove('visible');
            }
        }
        if (mobileQuery.matches) {
            requestAnimationFrame(initBottomNavPill);
            setTimeout(initBottomNavPill, 100);
            setTimeout(initBottomNavPill, 300);
        }
        if (mobileQuery.addEventListener) {
            mobileQuery.addEventListener('change', handleMobileChange);
        }
        else if (mobileQuery.addListener) {
            mobileQuery.addListener(handleMobileChange);
        }
        window.addEventListener('resize', initBottomNavPill);
        window.addEventListener('load', initBottomNavPill);
    }
    /* ---------- Signed in with an account: fetch this person's receipts ---------- */
    if (cloud.enabled) {
        (async function () {
            const user = await cloud.getUser();
            if (!user) {
                window.location.href = '../signin/signin.html';
                return;
            }
            // The name can arrive only now (first visit after Google sign-in)
            const name = (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || '';
            if (name && welcomeHeading)
                welcomeHeading.textContent = 'Welcome back, ' + name.trim().split(/\s+/)[0] + '!';
            if (name && avatarEl)
                avatarEl.textContent = getInitials(name);
            try {
                RECEIPTS.push(...await cloud.loadReceipts());
            }
            catch (error) {
                toast('Could not load your receipts: ' + error.message);
            }
            RECEIPTS.forEach(tally); // fills in items, gfItems, overcharge and status
            applyFilters();
            updateMetrics(true);
        })();
    }
})();
