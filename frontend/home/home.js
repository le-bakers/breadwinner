// @ts-nocheck
import { pageUrl } from '../routes.js';
import { displayMetrics } from './metrics.js';
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
    if (welcomeHeading && storedName && welcomeHeading.textContent.includes('Welcome back')) {
        const firstName = storedName.trim().split(/\s+/)[0];
        welcomeHeading.textContent = 'Welcome back, ' + firstName + '!';
    }
    const reportingMonth = document.getElementById('dashboardPeriod');
    if (reportingMonth)
        reportingMonth.textContent = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date());
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
    // Scope the dashboard to this month without dropping older saved receipts.
    function getPageReceipts() {
        if (document.body.dataset.receiptPeriod !== 'current-month')
            return RECEIPTS;
        const now = new Date();
        const month = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-';
        return RECEIPTS.filter(receipt => typeof receipt.date === 'string' && receipt.date.startsWith(month));
    }
    const dateFormatter = { format: (date) => window.BreadWinner.formatDate(date) };
    const money = (n) => '$' + n.toFixed(2);
    // The dashboard numbers are added up from the saved receipts, so they are always real.
    function updateMetrics(animateOnLoad = false) {
        const receipts = getPageReceipts();
        const total = Math.round(receipts.reduce((sum, receipt) => sum + (receipt.overcharge || 0), 0) * 100) / 100;
        const gfItems = receipts.reduce((sum, receipt) => sum + (receipt.gfItems || 0), 0);
        const average = receipts.length ? total / receipts.length : 0;
        displayMetrics([
            { id: 'totalOvercharge', value: total, format: 'money' },
            { id: 'receiptsCount', value: receipts.length, format: 'int' },
            { id: 'gfItemsCount', value: gfItems, format: 'int' },
            { id: 'averageOvercharge', value: average, format: 'money' }
        ], animateOnLoad);
        if (window.BreadWinner.receiptHistory)
            window.BreadWinner.receiptHistory.refresh();
    }
    updateMetrics(!cloud.enabled);
    const table = document.getElementById('receiptTable');
    const template = document.getElementById('rowTemplate');
    const searchInput = document.getElementById('receiptSearch');
    const sortSelect = document.getElementById('sortSelect');
    const suggest = window.BreadWinner.suggest; // suggest.js: fills in comparisons for the user to approve
    // receipt -> its row on screen, so a suggestion that arrives late can redraw the right row
    const ROW_PARTS = new WeakMap();
    // How each open receipt is shown: { gfFirst, hideOthers }. Only a view, never saved.
    const VIEW = new WeakMap();
    // Lines whose name/price are being edited right now
    const EDITING = new WeakSet();
    let receiptSequence = 0;
    function buildRow(receipt) {
        const frag = template.content.cloneNode(true);
        const row = frag.querySelector('.receipt-row');
        const expand = frag.querySelector('.receipt-expand');
        expand.id = 'receipt-details-' + (++receiptSequence);
        expand.setAttribute('aria-label', receipt.name + ' details');
        row.setAttribute('aria-controls', expand.id);
        row.setAttribute('aria-expanded', 'false');
        if (receipt.processing) {
            row.classList.add('receipt-row-processing');
            row.setAttribute('aria-label', 'Reading receipt');
            row.querySelector('.row-delete-btn').hidden = true;
            expand.hidden = true;
            frag.querySelector('.cell-name-text').textContent = receipt.name;
            frag.querySelector('.cell-date').innerHTML = '<span class="skeleton-line skeleton-date"></span>';
            frag.querySelector('.cell-items').innerHTML = '<span class="skeleton-line skeleton-short"></span>';
            frag.querySelector('.cell-gf').innerHTML = '<span class="skeleton-line skeleton-short"></span>';
            frag.querySelector('.cell-overcharge').innerHTML = '<span class="skeleton-line skeleton-money"></span>';
            frag.querySelector('.cell-status').innerHTML = '<span class="status-pill status-reading"><span class="status-spinner" aria-hidden="true"></span>Reading</span>';
            return frag;
        }
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
        const photoButton = frag.querySelector('.receipt-photo-button');
        if (photoButton) {
            photoButton.hidden = !receipt.imageUrl;
            frag.querySelector('.receipt-photo-empty').hidden = !!receipt.imageUrl;
            photoButton.addEventListener('click', () => {
                const dialog = document.getElementById('receiptPhotoDialog');
                dialog.querySelector('img').src = receipt.imageUrl;
                dialog.showModal();
            });
            // No photo yet (for example a manual receipt): this button lets the user add one
            const addPhotoButton = frag.querySelector('.receipt-photo-add');
            addPhotoButton.addEventListener('click', () => {
                const picker = document.createElement('input');
                picker.type = 'file';
                picker.accept = 'image/*';
                picker.addEventListener('change', () => {
                    if (picker.files && picker.files[0])
                        attachPhoto(receipt, picker.files[0]);
                });
                picker.click();
            });
        }
        ROW_PARTS.set(receipt, { row, expand });
        const view = { gfFirst: false, hideOthers: false };
        VIEW.set(receipt, view);
        expand.querySelector('.tool-gf-first').addEventListener('change', (e) => {
            view.gfFirst = e.target.checked;
            renderLines(receipt, row, expand);
        });
        expand.querySelector('.tool-hide-others').addEventListener('change', (e) => {
            view.hideOthers = e.target.checked;
            renderLines(receipt, row, expand);
        });
        renderLines(receipt, row, expand);
        // Typing in an item the scanner missed
        const addForm = frag.querySelector('.add-item-form');
        addForm.addEventListener('submit', (e) => {
            e.preventDefault();
            addLine(receipt, row, expand);
        });
        // A closed receipt can't be tabbed into
        expand.inert = true;
        const doneButton = expand.querySelector('.receipt-review-done');
        if (doneButton)
            doneButton.addEventListener('click', () => {
                toggleRow(row, expand);
                row.focus();
            });
        row.addEventListener('click', () => toggleRow(row, expand));
        row.addEventListener('keydown', (e) => {
            if (e.target !== row)
                return;
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
        // Which lines to show, and in what order. Sorting never changes the saved order.
        const view = VIEW.get(receipt) || {};
        let shown = receipt.lines.slice();
        if (view.hideOthers)
            shown = shown.filter((line) => line.gf);
        if (view.gfFirst)
            shown = shown.filter((line) => line.gf).concat(shown.filter((line) => !line.gf));
        const others = receipt.lines.filter((line) => !line.gf).length;
        expand.querySelector('.tool-hide-text').textContent = others ? 'Hide other items (' + others + ')' : 'Hide other items';
        shown.forEach((line) => {
            if (EDITING.has(line)) {
                list.appendChild(buildEditItem(receipt, row, expand, line));
                return;
            }
            const li = document.createElement('li');
            li._line = line; // so focusLine can find this row however the list is sorted
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
                focusLine(expand, line, '.item-mark');
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
                    approveBtn.setAttribute('aria-label', 'Approve ' + money(draft.deduction) + ' deduction for ' + line.name);
                    approveBtn.title = draft.warnings.concat('Press to count this suggestion.').join(' ');
                    approveBtn.addEventListener('click', () => {
                        approve(line);
                        saveLines(receipt, row, expand);
                        focusLine(expand, line, '.badge-tax');
                        toast('Saved. ' + money(line.compare.deduction) + ' counted for ' + line.name);
                    });
                    badges.appendChild(approveBtn);
                }
                const b = document.createElement('button');
                b.type = 'button';
                if (line.compare) {
                    b.className = 'badge badge-tax' + (line.compare.warnings.length ? ' badge-check' : '');
                    b.textContent = '+' + money(line.compare.deduction) + ' deduction';
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
                        focusLine(expand, line, '.badge-tax');
                        toast('Saved. ' + money(compare.deduction) + ' counted for ' + line.name);
                    }
                }));
                badges.appendChild(b);
                // One press looks up a suggested regular price for just this item
                if (!line.compare && !draft) {
                    const s = document.createElement('button');
                    s.type = 'button';
                    s.className = 'badge badge-suggest';
                    s.textContent = 'Find at Kroger';
                    s.setAttribute('aria-label', 'Suggest a regular price for ' + line.name);
                    s.title = 'Look up the regular version at the nearest Kroger-family store';
                    s.addEventListener('click', () => suggestLine(receipt, row, expand, line, s));
                    badges.insertBefore(s, b);
                }
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
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'item-remove-btn';
            removeBtn.setAttribute('aria-label', 'Remove ' + line.name);
            removeBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            removeBtn.addEventListener('click', () => {
                const index = receipt.lines.indexOf(line);
                receipt.lines.splice(index, 1);
                saveLines(receipt, row, expand);
                const next = receipt.lines[Math.min(index, receipt.lines.length - 1)];
                if (next)
                    focusLine(expand, next, '.item-edit-btn');
                else
                    expand.querySelector('.add-item-name').focus();
                toast('Removed ' + line.name);
            });
            li.appendChild(mark);
            li.appendChild(name);
            // The pencil: fix a name or price the scanner got wrong
            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'item-price item-edit-btn';
            editBtn.setAttribute('aria-label', 'Edit ' + line.name + ', price paid ' + money(line.price));
            editBtn.title = 'Edit the name or price';
            editBtn.innerHTML = money(line.price) + ' <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
            editBtn.addEventListener('click', () => {
                EDITING.add(line);
                renderLines(receipt, row, expand);
                focusLine(expand, line, '.edit-name');
            });
            li.appendChild(editBtn);
            li.appendChild(badges);
            li.appendChild(removeBtn);
            list.appendChild(li);
        });
        showRowTotals(receipt, row, expand);
        showItemsCheck(receipt, expand);
        showSuggestBar(receipt, row, expand);
    }
    // The row shown while the user edits an item's name or price
    function buildEditItem(receipt, row, expand, line) {
        const li = document.createElement('li');
        li._line = line;
        li.className = 'item-editing';
        const form = document.createElement('form');
        form.className = 'edit-item-form';
        form.noValidate = true;
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'edit-name';
        nameInput.maxLength = 60;
        nameInput.value = line.name;
        nameInput.setAttribute('aria-label', 'Item name');
        nameInput.autocomplete = 'off';
        const priceInput = document.createElement('input');
        priceInput.type = 'text';
        priceInput.inputMode = 'decimal';
        priceInput.className = 'edit-price';
        priceInput.value = line.price.toFixed(2);
        priceInput.setAttribute('aria-label', 'Price in dollars');
        priceInput.autocomplete = 'off';
        const saveBtn = document.createElement('button');
        saveBtn.type = 'submit';
        saveBtn.className = 'btn btn-primary btn-sm';
        saveBtn.textContent = 'Save';
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn btn-secondary btn-sm';
        cancelBtn.textContent = 'Cancel';
        const error = document.createElement('p');
        error.className = 'add-item-error';
        error.setAttribute('role', 'alert');
        error.hidden = true;
        function close() {
            EDITING.delete(line);
            renderLines(receipt, row, expand);
            focusLine(expand, line, '.item-edit-btn');
        }
        cancelBtn.addEventListener('click', close);
        form.addEventListener('keydown', (e) => { if (e.key === 'Escape')
            close(); });
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const newName = nameInput.value.trim();
            // Same price rules as adding an item: "4.99", "$4.99" and "4,99" all work
            const newPrice = Number(priceInput.value.trim().replace(/\$/g, '').replace(',', '.'));
            let problem = '';
            if (!newName)
                problem = 'Type the item’s name.';
            else if (!priceInput.value.trim() || !Number.isFinite(newPrice) || newPrice <= 0)
                problem = 'Type the price as a number, like 4.99.';
            error.textContent = problem;
            error.hidden = !problem;
            if (problem) {
                (newName ? priceInput : nameInput).focus();
                return;
            }
            const rounded = Math.round(newPrice * 100) / 100;
            const priceChanged = Math.abs(rounded - line.price) >= 0.005;
            if (newName !== line.name) {
                line.name = newName;
                // The helper name and search word described the old text
                delete line.plainName;
                delete line.regularTerm;
                delete line.sizeGuess;
            }
            line.price = rounded;
            line.unsure = false; // the user has looked at this line
            // A saved comparison was worked out from the old price, so it can't be kept
            const lostComparison = priceChanged && (line.compare || line.draft);
            if (priceChanged) {
                delete line.compare;
                delete line.draft;
            }
            EDITING.delete(line);
            saveLines(receipt, row, expand);
            focusLine(expand, line, '.item-edit-btn');
            toast(lostComparison ? 'Saved. The price changed, so compare this item again.' : 'Saved ' + line.name);
        });
        const nameLabel = document.createElement('label');
        nameLabel.className = 'edit-name-field';
        nameLabel.textContent = 'Item name';
        nameLabel.appendChild(nameInput);
        const priceLabel = document.createElement('label');
        priceLabel.className = 'edit-price-field';
        priceLabel.textContent = 'Price paid';
        priceLabel.appendChild(priceInput);
        form.appendChild(nameLabel);
        form.appendChild(priceLabel);
        form.appendChild(saveBtn);
        form.appendChild(cancelBtn);
        form.appendChild(error);
        li.appendChild(form);
        return li;
    }
    // The "Suggest" button on one item: an earlier approved comparison first, then Kroger
    async function suggestLine(receipt, row, expand, line, button) {
        let draft = suggest.recall(line, RECEIPTS);
        if (!draft) {
            const zip = suggest.getZip();
            if (!zip) {
                toast('Type your zip code in the bar above, then press Suggest again.');
                const zipInput = expand.querySelector('.suggest-form input');
                if (zipInput)
                    zipInput.focus();
                return;
            }
            button.disabled = true;
            button.textContent = 'Looking…';
            const answer = await suggest.askKroger(line, zip, API_BASE);
            draft = answer.draft;
            if (!draft) {
                renderLines(receipt, row, expand);
                toast(answer.problem || 'No match found. Use “Compare price” instead.');
                return;
            }
        }
        // The user may have compared this line by hand while Kroger was answering
        if (line.compare)
            return;
        line.draft = draft;
        saveLines(receipt, row, expand);
        focusLine(expand, line, '.badge-approve');
        toast('Price suggested. Check it, then approve.');
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
            text += '. Your package size (' + draft.gfSize + ') is our best guess, so check it';
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
            if (!draft && zip) {
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
        const canAsk = receipt.lines.some((line) => line.gf && !line.compare && !line.draft);
        bar.textContent = '';
        bar.hidden = !drafts.length && !canAsk;
        if (drafts.length) {
            const text = document.createElement('p');
            text.textContent = drafts.length === 1
                ? '1 comparison to approve. Only approved amounts count.'
                : drafts.length + ' comparisons to approve. Only approved amounts count.';
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
                const title = document.createElement('strong');
                title.textContent = 'Compare with Kroger';
                text.appendChild(title);
                text.appendChild(document.createTextNode('Find regular alternatives nearby. Review before approving.'));
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
            askBtn.textContent = 'Find prices';
            const zipLabel = document.createElement('label');
            zipLabel.textContent = 'ZIP code';
            zipLabel.appendChild(zipInput);
            form.appendChild(zipLabel);
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
    function focusLine(expand, line, selector) {
        const li = Array.from(expand.querySelectorAll('.expand-item-list li')).find((item) => item._line === line);
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
        overchargeCell.textContent = money(receipt.overcharge || 0);
        overchargeCell.classList.toggle('zero', !(receipt.overcharge > 0));
        const statusCell = row.querySelector('.cell-status');
        statusCell.textContent = '';
        const pill = document.createElement('span');
        pill.className = 'status-pill ' + (receipt.status === 'processed' ? 'status-processed' : 'status-review');
        pill.textContent = receipt.status === 'processed' ? 'Processed' : 'Needs Review';
        statusCell.appendChild(pill);
        const total = expand.querySelector('.receipt-total');
        total.hidden = !receipt.gfItems;
        total.textContent = 'Receipt deduction · ' + money(receipt.overcharge || 0);
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
                + '. An item may be missing or a price misread. Compare with the photo, then edit (pencil), remove or add items below.';
    }
    function saveLines(receipt, row, expand) {
        tally(receipt);
        saveReceipts(receipt);
        renderLines(receipt, row, expand);
        updateMetrics();
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
            updateMetrics();
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
        row.setAttribute('aria-expanded', String(isOpen));
    }
    function render(list) {
        if (window.BreadWinner.receiptHistory) {
            window.BreadWinner.receiptHistory.render(table, list, buildRow);
            return;
        }
        table.querySelectorAll('.receipt-row:not(.receipt-row-head), .receipt-expand, .receipt-empty').forEach((el) => el.remove());
        if (!list.length) {
            const empty = document.createElement('div');
            empty.className = 'receipt-empty';
            empty.textContent = searchInput.value.trim()
                ? 'No receipts match your search.'
                : 'No receipts this month yet! Click the green + button to upload or take a photo of a receipt.';
            table.appendChild(empty);
            return;
        }
        list.forEach((r) => table.appendChild(buildRow(r)));
    }
    function applyFilters() {
        const query = (searchInput.value || '').toLowerCase().trim();
        let list = getPageReceipts().filter((r) => r.name.toLowerCase().includes(query));
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
        applyFilters();
        searchInput.addEventListener('input', applyFilters);
        sortSelect.addEventListener('change', applyFilters);
    }
    if (window.BreadWinner && window.BreadWinner.staggerReveal) {
        window.BreadWinner.staggerReveal('.summary-panel', 80);
    }
    /* ---------- Camera workspace ---------- */
    const photoBtn = document.getElementById('fabUpload');
    const fabWrapper = document.getElementById('fabWrapper');
    const fabOptionCamera = document.getElementById('fabOptionCamera');
    const fabOptionUpload = document.getElementById('fabOptionUpload');
    const fabOptionManual = document.getElementById('fabOptionManual');
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
        if (!cameraFlash || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
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
        updateMetrics();
        if (!window.matchMedia('(max-width: 860px)').matches)
            return;
        document.getElementById('receipts').scrollIntoView({ block: 'start' });
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
        let response;
        try {
            response = await fetch(API_BASE + '/scan', { method: 'POST', body: form });
        }
        catch (error) {
            response = null;
        }
        // A free Render server that is waking up or restarting drops the first try (no answer, or 502/503/504). Try once more.
        if (!response || [502, 503, 504].includes(response.status)) {
            toast('The scanner had a hiccup. Trying again…');
            await new Promise((resolve) => setTimeout(resolve, 3000));
            response = await fetch(API_BASE + '/scan', { method: 'POST', body: form });
        }
        if (!response.ok) {
            // The server explains a refused photo in plain words (too big, wrong kind of file, damaged)
            const reply = await response.json().catch(() => ({}));
            const error = new Error('Scan failed: ' + response.status);
            error.reason = response.status < 500 && typeof reply.detail === 'string' ? reply.detail : '';
            throw error;
        }
        return response.json(); // { engine, items, subtotal }
    }
    // The biggest photo the scanner accepts (the server has the same limit)
    const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
    // A small JPEG copy (800 pixels on the longer side, about 50 KB) is what gets saved with the receipt, not the original.
    // Decoding the picture is also the check that the file really is a photo: a damaged or non-image file throws here.
    async function makeThumbnail(blob) {
        const bitmap = await createImageBitmap(blob);
        const scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        return new Promise((resolve, reject) => {
            canvas.toBlob((jpeg) => (jpeg ? resolve(jpeg) : reject(new Error('Could not shrink the photo'))), 'image/jpeg', 0.7);
        });
    }
    async function processReceipt(blob) {
        // Refuse a photo that is too big or can't be opened before anything is saved or sent
        let thumbnail = null;
        let photoProblem = '';
        if (blob.size > MAX_PHOTO_BYTES)
            photoProblem = 'That photo is bigger than 10 MB. Try a smaller one.';
        else {
            try {
                thumbnail = await makeThumbnail(blob);
            }
            catch (error) {
                photoProblem = 'That file could not be opened as a photo. Choose a JPEG, PNG or WebP picture.';
            }
        }
        if (photoProblem) {
            if (window.BreadWinner.dismissToast)
                window.BreadWinner.dismissToast();
            toast(photoProblem);
            if (cameraStatus)
                cameraStatus.textContent = 'Try another photo';
            return;
        }
        // Signed in: the photo becomes a file in the account (cloud.js uploads photoBlob). Demo mode: it stays in this browser as a "data:" address.
        const photoUrl = cloud.enabled ? URL.createObjectURL(thumbnail) : await blobToDataUrl(thumbnail);
        const receipt = addReceiptToHistory(photoUrl, [], null, true);
        if (cloud.enabled)
            receipt.photoBlob = thumbnail;
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
            else if (error.reason)
                scanProblem = 'Photo saved, but the scanner said: ' + error.reason;
            else
                scanProblem = 'Photo saved, but that file could not be read as a receipt.';
        }
        receipt.processing = false;
        receipt.lines = items.map((item) => ({
            name: item.name,
            price: item.price,
            quantity: item.quantity || 1,
            gf: typeof item.gf === 'boolean' ? item.gf : null,
            gfReason: item.gf_reason || null,
            plainName: item.plain_name || null,
            regularTerm: item.regular_term || null,
            sizeGuess: item.package_size || null,
            unsure: item.unsure === true
        }));
        receipt.lines.forEach(rememberGf);
        receipt.subtotal = subtotal;
        tally(receipt);
        saveReceipts(receipt);
        applyFilters();
        updateMetrics();
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
        if (window.BreadWinner.dismissToast)
            window.BreadWinner.dismissToast();
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
    // Receipts print the same short name for a brand's regular and gluten-free versions (like "BARILLA"),
    // so the scanner's guess can change from one scan to the next. If this person already confirmed the
    // same printed name at the same price as gluten-free on an earlier receipt, use that instead.
    function rememberGf(line) {
        if (line.gf)
            return;
        const confirmed = RECEIPTS.some((receipt) => receipt.lines && receipt.lines.some((old) => old !== line && old.gf === true && (old.compare || old.gfReason === 'Marked gluten-free by you')
            && old.name.toLowerCase() === line.name.toLowerCase() && old.price === line.price));
        if (!confirmed)
            return;
        line.gf = true;
        line.gfReason = 'You marked this gluten-free on an earlier receipt';
    }
    // Adds a photo to a receipt that has none. The photo is only kept, not scanned: the items stay as typed.
    async function attachPhoto(receipt, file) {
        let thumbnail = null;
        if (file.size > MAX_PHOTO_BYTES) {
            toast('That photo is bigger than 10 MB. Try a smaller one.');
            return;
        }
        try {
            thumbnail = await makeThumbnail(file);
        }
        catch (error) {
            toast('That file could not be opened as a photo. Choose a JPEG, PNG or WebP picture.');
            return;
        }
        receipt.imageUrl = cloud.enabled ? URL.createObjectURL(thumbnail) : await blobToDataUrl(thumbnail);
        if (cloud.enabled)
            receipt.photoBlob = thumbnail;
        saveReceipts(receipt);
        // Rebuild this receipt's row so the photo shows, keeping it open
        const parts = ROW_PARTS.get(receipt);
        const wasOpen = parts && parts.row.classList.contains('open');
        applyFilters();
        const fresh = ROW_PARTS.get(receipt);
        if (wasOpen && fresh)
            toggleRow(fresh.row, fresh.expand);
        toast('Photo added');
    }
    function addReceiptToHistory(imageUrl, items, subtotal, processing = false, storeName = 'Captured Receipt') {
        const now = new Date();
        // Today's date where the user is (toISOString would give the date in London)
        const dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
        // gf: the server's guess (true/false) that this is a gluten-free product. The user can flip it.
        // gfReason: why it guessed so. plainName: a plain-English reading of the receipt's short name.
        // regularTerm: what to search for to price the regular version.
        // sizeGuess: the reader's guess at the size of one package ("12 oz"), only for gluten-free lines
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
            sizeGuess: item.package_size || null,
            unsure: item.unsure === true
        }));
        const newReceipt = {
            name: storeName,
            date: dateStr,
            subtotal, // the subtotal printed on the receipt, or null when the scanner found none
            lines,
            imageUrl,
            processing
        };
        tally(newReceipt); // fills in items, gfItems, overcharge and status
        RECEIPTS.unshift(newReceipt);
        if (!processing)
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
        toast('Reading receipt…', 0);
        try {
            await processReceipt(capturedBlob);
        }
        catch (error) {
            if (cameraStatus)
                cameraStatus.textContent = 'Could not save photo';
            if (window.BreadWinner.dismissToast)
                window.BreadWinner.dismissToast();
        }
        cameraConfirmBtn.disabled = false;
    }
    function closeCamera() {
        stopCamera();
        cameraOverlay.hidden = true;
        document.body.style.overflow = '';
    }
    function setFabOptionsOpen(open) {
        if (!fabWrapper || !photoBtn || !fabOptionCamera || !fabOptionUpload || !fabOptionManual)
            return;
        fabWrapper.classList.toggle('is-options-open', open);
        document.getElementById('mobileBottomNav')?.classList.toggle('is-scan-open', open);
        photoBtn.setAttribute('aria-expanded', String(open));
        [fabOptionCamera, fabOptionUpload, fabOptionManual].forEach((option) => {
            option.setAttribute('aria-hidden', String(!open));
            option.tabIndex = open ? 0 : -1;
        });
    }
    if (photoBtn && fabWrapper && fabOptionCamera && fabOptionUpload && fabOptionManual && cameraOverlay) {
        fabOptionCamera.hidden = false;
        fabOptionUpload.hidden = false;
        fabOptionManual.hidden = false;
        setFabOptionsOpen(false);
        photoBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            setFabOptionsOpen(!fabWrapper.classList.contains('is-options-open'));
        });
        document.addEventListener('click', (e) => {
            if (fabWrapper.classList.contains('is-options-open') && !fabWrapper.contains(e.target)) {
                setFabOptionsOpen(false);
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && fabWrapper.classList.contains('is-options-open')) {
                setFabOptionsOpen(false);
                photoBtn.focus();
            }
        });
        // Handle "Take a picture" option click
        fabOptionCamera.addEventListener('click', (e) => {
            e.stopPropagation();
            setFabOptionsOpen(false);
            closeCamera();
            cameraOverlay.hidden = false;
            startCamera();
        });
        // Handle "Upload a photo" option click
        fabOptionUpload.addEventListener('click', (e) => {
            e.stopPropagation();
            setFabOptionsOpen(false);
            closeCamera();
            if (fileInput)
                fileInput.click();
        });
        // Handle "Enter manually": a blank receipt, opened so the user can type in items
        fabOptionManual.addEventListener('click', (e) => {
            e.stopPropagation();
            setFabOptionsOpen(false);
            closeCamera();
            const receipt = addReceiptToHistory(null, [], null, false, 'Manual Receipt');
            const parts = ROW_PARTS.get(receipt);
            if (parts) {
                toggleRow(parts.row, parts.expand);
                parts.row.scrollIntoView({ block: 'center' });
            }
            toast('Blank receipt added. Add its items below.');
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
            toast('Reading receipt…', 0);
            try {
                await processReceipt(file);
            }
            catch (error) {
                console.error('Could not save uploaded receipt:', error);
                if (window.BreadWinner.dismissToast)
                    window.BreadWinner.dismissToast();
            }
        });
    }
    /* ---------- Signed in with an account: fetch this person's receipts ---------- */
    if (cloud.enabled) {
        async function loadAccount() {
            let user;
            try {
                user = await cloud.getUser();
            }
            catch (error) {
                // cloud.js keeps the protected page hidden and offers a retry.
                return;
            }
            if (!user) {
                window.location.href = pageUrl('/signin');
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
        }
        loadAccount();
    }
})();
