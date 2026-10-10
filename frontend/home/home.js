/* ============================================
   BreadWinner — Dashboard JS
   ============================================ */

(function () {
  'use strict';

  /* ---------- User profile ---------- */
  const storedName = (function () {
    try {
      return localStorage.getItem('breadwinner_user_name') || '';
    } catch (e) { return ''; }
  })();

  function getInitials(name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'JM';
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
  const RECEIPTS_STORAGE_KEY = 'breadwinner_receipts';
  function loadReceipts() {
    try {
      const stored = JSON.parse(localStorage.getItem(RECEIPTS_STORAGE_KEY) || '[]');
      return Array.isArray(stored) ? stored : [];
    } catch (e) { return []; }
  }
  function saveReceipts() {
    try { localStorage.setItem(RECEIPTS_STORAGE_KEY, JSON.stringify(RECEIPTS)); } catch (e) { /* storage unavailable */ }
  }
  const RECEIPTS = loadReceipts();

  const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const money = (n) => '$' + n.toFixed(2);

  function updateMetrics() {
    const totalOvercharge = RECEIPTS.reduce((sum, receipt) => sum + Number(receipt.overcharge || 0), 0);
    const totalGfItems = RECEIPTS.reduce((sum, receipt) => sum + Number(receipt.gfItems || 0), 0);
    const averageOvercharge = RECEIPTS.length ? totalOvercharge / RECEIPTS.length : 0;
    const values = {
      receiptsCount: { value: RECEIPTS.length, text: String(RECEIPTS.length) },
      gfItemsCount: { value: totalGfItems, text: String(totalGfItems) },
      totalOvercharge: { value: totalOvercharge, text: money(totalOvercharge) },
      averageOvercharge: { value: averageOvercharge, text: money(averageOvercharge) }
    };
    Object.keys(values).forEach((id) => {
      const element = document.getElementById(id);
      if (!element) return;
      element.dataset.target = String(values[id].value);
      element.textContent = values[id].text;
    });
  }

  const table = document.getElementById('receiptTable');
  const template = document.getElementById('rowTemplate');
  const searchInput = document.getElementById('receiptSearch');
  const sortSelect = document.getElementById('sortSelect');

  function buildRow(receipt) {
    const frag = template.content.cloneNode(true);
    const row = frag.querySelector('.receipt-row');
    const expand = frag.querySelector('.receipt-expand');

    frag.querySelector('.cell-name-text').textContent = receipt.name;
    frag.querySelector('.cell-date').textContent = dateFormatter.format(new Date(receipt.date + 'T00:00'));
    frag.querySelector('.cell-items').textContent = receipt.items;
    frag.querySelector('.cell-gf').textContent = receipt.gfItems;
    if (receipt.imageUrl) {
      frag.querySelector('.expand-receipt-img').src = receipt.imageUrl;
    }

    const overchargeCell = frag.querySelector('.cell-overcharge');
    overchargeCell.textContent = receipt.overcharge > 0 ? money(receipt.overcharge) : '—';
    overchargeCell.classList.toggle('zero', receipt.overcharge === 0);

    const statusCell = frag.querySelector('.cell-status');
    const pill = document.createElement('span');
    pill.className = 'status-pill ' + (receipt.status === 'processed' ? 'status-processed' : 'status-review');
    pill.textContent = receipt.status === 'processed' ? 'Processed' : 'Needs Review';
    statusCell.appendChild(pill);

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
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleRow(row, expand); }
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
      const mark = document.createElement('span');
      mark.className = 'item-mark ' + (line.gf === null ? 'unknown' : line.gf ? 'yes' : 'no');
      if (line.gf === null) mark.title = 'Not checked for gluten-free yet';
      mark.innerHTML = line.gf === null ? '?' : line.gf
        ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        : '<svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';

      const name = document.createElement('span');
      name.className = 'item-name';
      name.textContent = line.name;

      const badges = document.createElement('span');
      badges.className = 'item-badges';
      if (line.gf) {
        const b = document.createElement('span'); b.className = 'badge badge-gf'; b.textContent = 'GF'; badges.appendChild(b);
      }
      if (line.tax) {
        const b = document.createElement('span'); b.className = 'badge badge-tax'; b.textContent = 'Tax Deductible'; badges.appendChild(b);
      }
      if (line.added) {
        const b = document.createElement('span'); b.className = 'badge badge-added'; b.textContent = 'Added by you'; badges.appendChild(b);
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

    row.querySelector('.cell-items').textContent = receipt.lines.length;
    row.querySelector('.cell-gf').textContent = receipt.gfItems;
    showItemsCheck(receipt, expand);
  }

  // Many receipts print a subtotal. If the items don't add up to it, a line is missing or a price was misread.
  function showItemsCheck(receipt, expand) {
    const note = expand.querySelector('.items-check');
    if (typeof receipt.subtotal !== 'number') { note.hidden = true; return; }

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
    receipt.items = receipt.lines.length;
    receipt.gfItems = receipt.lines.filter((line) => line.gf).length;
    saveReceipts();
    renderLines(receipt, row, expand);
    updateMetrics();
  }

  function addLine(receipt, row, expand) {
    const nameInput = expand.querySelector('.add-item-name');
    const priceInput = expand.querySelector('.add-item-price');
    const error = expand.querySelector('.add-item-error');

    const name = nameInput.value.trim();
    // Accepts "4.99", "$4.99" and "4,99"
    const price = Number(priceInput.value.trim().replace('$', '').replace(',', '.'));

    let problem = '';
    if (!name) problem = 'Type the item’s name.';
    else if (!priceInput.value.trim() || !Number.isFinite(price) || price <= 0) problem = 'Type the price as a number, like 4.99.';

    error.textContent = problem;
    error.hidden = !problem;
    if (problem) { (name ? priceInput : nameInput).focus(); return; }

    // gf: null means "not checked yet". added: true keeps typed-in items apart from scanned ones.
    receipt.lines.push({ name, price: Math.round(price * 100) / 100, gf: null, tax: false, added: true });
    saveLines(receipt, row, expand);

    nameInput.value = '';
    priceInput.value = '';
    nameInput.focus();  // ready for the next item
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
    if (deleteOpenedFrom && deleteOpenedFrom.isConnected) deleteOpenedFrom.focus();
    deleteOpenedFrom = null;
  }

  function deleteReceipt() {
    const index = RECEIPTS.indexOf(receiptToDelete);
    if (index !== -1) {
      RECEIPTS.splice(index, 1);
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
    deleteModal.addEventListener('click', (e) => { if (e.target === deleteModal) closeDeleteModal(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !deleteModal.hidden) closeDeleteModal();
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
    updateMetrics();
    searchInput.addEventListener('input', applyFilters);
    sortSelect.addEventListener('change', applyFilters);
  }

  /* ---------- Animated stat counters ---------- */
  const statEls = document.querySelectorAll('[data-counter]');
  if (statEls.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const target = parseFloat(el.dataset.target || '0');
        const prefix = el.dataset.prefix || '';
        const decimals = parseInt(el.dataset.decimals || '0', 10);
        const duration = 1200;
        const start = performance.now();

        function tick(now) {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          const value = target * eased;
          el.textContent = prefix + (decimals ? value.toFixed(decimals) : Math.round(value));
          if (progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
        io.unobserve(el);
      });
    }, { threshold: 0.4 });
    statEls.forEach((el) => io.observe(el));
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
    if (cameraStatus) { cameraStatus.textContent = 'Requesting access…'; cameraStatus.classList.remove('live'); }
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
    if (retryBtn) retryBtn.addEventListener('click', (e) => { e.stopPropagation(); startCamera(); });
    const fallbackBtn = cameraPlaceholder.querySelector('.camera-fallback');
    if (fallbackBtn) fallbackBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeCamera();
      if (fileInput) fileInput.click();
    });
    if (cameraStatus) { cameraStatus.textContent = 'Unavailable'; cameraStatus.classList.remove('live'); }
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
    if (!mediaStream) return;
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
    if (scanGuide) scanGuide.hidden = true;
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
      await cameraVideo.play().catch(() => {});
      setTimeout(() => { if (mediaStream === stream) enableWhenReady(); }, 1200);
    } catch (err) {
      if (requestId !== cameraRequestId || cameraOverlay.hidden) return;
      stopMediaStream();
      setCameraError(cameraErrorMessage(err));
    }
  }

  function enableWhenReady() {
    if (streamReady) return;
    if (!cameraVideo.videoWidth || !cameraVideo.videoHeight) return;
    streamReady = true;
    cameraFooter.hidden = false;
    cameraCaptureBtn.disabled = false;
    if (scanGuide) scanGuide.hidden = false;
    if (cameraStatus) { cameraStatus.textContent = 'Ready'; cameraStatus.classList.add('live'); }
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
    if (scanGuide) scanGuide.hidden = true;
    if (cameraStatus) { cameraStatus.textContent = 'Starting camera…'; cameraStatus.classList.remove('live'); }
  }

  function flashShutter() {
    if (!cameraFlash || document.documentElement.getAttribute('data-reduce-motion') === 'true') return;
    cameraFlash.hidden = false;
    void cameraFlash.offsetWidth;
    cameraFlash.classList.remove('flash');
    void cameraFlash.offsetWidth;
    cameraFlash.classList.add('flash');
    setTimeout(() => { cameraFlash.hidden = true; cameraFlash.classList.remove('flash'); }, 400);
  }

  function capturePhoto() {
    if (!streamReady || !cameraVideo.videoWidth || !cameraVideo.videoHeight) return;
    flashShutter();
    const video = cameraVideo;
    const canvas = cameraCanvas;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      capturedBlob = blob;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(blob);
      cameraPreviewImg.src = previewUrl;
      cameraVideo.hidden = true;
      cameraViewport.hidden = true;
      if (scanGuide) scanGuide.hidden = true;
      cameraFooter.hidden = true;
      cameraPreview.hidden = false;
      if (cameraStatus) { cameraStatus.textContent = 'Captured'; cameraStatus.classList.remove('live'); }
    }, 'image/jpeg', 0.92);
  }

  function retakePhoto() {
    capturedBlob = null;
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    // Return to the live feed. If the stream is gone for any reason, restart it.
    if (!mediaStream || !cameraVideo.srcObject) {
      startCamera();
      return;
    }
    cameraPreview.hidden = true;
    cameraViewport.hidden = false;
    cameraVideo.hidden = false;
    cameraFooter.hidden = false;
    if (scanGuide) scanGuide.hidden = false;
    if (cameraStatus) { cameraStatus.textContent = 'Ready'; cameraStatus.classList.add('live'); }
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
    if (!window.matchMedia('(max-width: 860px)').matches) return;
    switchMobileView('receipt');
    const receiptItem = bottomNav && bottomNav.querySelector('[data-nav="receipt"]');
    if (receiptItem) {
      bottomNav.querySelectorAll('.bottom-nav-item').forEach((item) => item.classList.remove('active'));
      receiptItem.classList.add('active');
      positionBottomNavPill(receiptItem);
    }
  }

  /* ---------- Receipt scanning ---------- */
  // Where the Python server lives. Change this when the backend is deployed.
  const API_BASE = 'http://127.0.0.1:8000';

  function toast(message) {
    if (window.BreadWinner && window.BreadWinner.toast) window.BreadWinner.toast(message);
  }

  async function scanReceipt(blob) {
    const form = new FormData();
    form.append('file', blob, 'receipt.jpg');
    const response = await fetch(API_BASE + '/scan', { method: 'POST', body: form });
    if (!response.ok) throw new Error('Scan failed: ' + response.status);
    return response.json();  // { engine, items, subtotal }
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
    } catch (error) {
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
      if (error instanceof TypeError) scanProblem = 'Photo saved, but the scanner server is not running, so no items were read.';
      else scanProblem = 'Photo saved, but that file could not be read as a receipt.';
    }

    addReceiptToHistory(await makeThumbnail(blob), items, subtotal);

    const hardToRead = items.filter((item) => item.unsure).length;
    if (scanProblem) toast(scanProblem);
    else if (!items.length) toast('No items found. Try a clearer, flatter photo.');
    else if (hardToRead) toast('Found ' + items.length + ' items. ' + hardToRead + (hardToRead === 1 ? ' was' : ' were') + ' hard to read. Open the receipt to check.');
    else toast('Found ' + items.length + (items.length === 1 ? ' item' : ' items') + '. Open the receipt to review.');
  }

  function addReceiptToHistory(imageUrl, items, subtotal) {
    const now = new Date();
    // Today's date where the user is (toISOString would give the date in London)
    const dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const storeName = 'Captured Receipt';

    // gf: null means "not checked yet" (gluten-free detection is not built yet)
    // unsure: true means the scanner was not confident about that line
    const lines = items.map((item) => ({ name: item.name, price: item.price, gf: null, tax: false, unsure: item.unsure === true }));

    const newReceipt = {
      name: storeName,
      date: dateStr,
      items: lines.length,
      gfItems: 0,
      overcharge: 0,
      status: 'review',
      subtotal,  // the subtotal printed on the receipt, or null when the scanner found none
      lines,
      imageUrl
    };

    RECEIPTS.unshift(newReceipt);
    saveReceipts();
    showReceiptHistory();

    closeCamera();

    const fab = document.getElementById('fabUpload');
    fab.style.background = '#10B981';
    setTimeout(() => { fab.style.background = ''; }, 800);
  }

  async function confirmAndAddReceipt() {
    if (!capturedBlob) return;
    cameraConfirmBtn.disabled = true;
    if (cameraStatus) cameraStatus.textContent = 'Reading receipt…';
    try {
      await processReceipt(capturedBlob);
    } catch (error) {
      if (cameraStatus) cameraStatus.textContent = 'Could not save photo';
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
      if (!file) return;
      closeCamera();
      toast('Reading receipt…');
      try { await processReceipt(file); }
      catch (error) { console.error('Could not save uploaded receipt:', error); }
    });
  }

  /* ---------- Mobile bottom navbar sliding pill ---------- */
  const bottomNav = document.getElementById('mobileBottomNav');
  const bottomNavPill = document.getElementById('bottomNavPill');

  function positionBottomNavPill(item) {
    if (!bottomNavPill || !item) return;
    const navRect = bottomNav.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    const pillWidth = bottomNavPill.offsetWidth;
    const itemCenter = itemRect.left + itemRect.width / 2;
    const offset = itemCenter - navRect.left - pillWidth / 2;
    bottomNavPill.style.transform = 'translateX(' + offset + 'px)';
  }

  function initBottomNavPill() {
    if (!bottomNav || !bottomNavPill) return;
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
    if (!bottomNav) return;
    if ((window.location.hash || '') === '#receipts') {
      // On desktop this is a no-op, leaving the default anchor scroll intact.
      switchMobileView('receipt');
    }
  }

  const dashboardView = document.getElementById('dashboardView');
  const receiptView = document.getElementById('receiptView');

  function switchMobileView(viewName) {
    if (!dashboardView || !receiptView) return;
    const isMobile = window.matchMedia('(max-width: 860px)').matches;
    if (!isMobile) return;

    if (viewName === 'receipt') {
      dashboardView.hidden = true;
      receiptView.hidden = false;
    } else {
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
          if (window.matchMedia('(max-width: 860px)').matches) e.preventDefault();
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
      } else {
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
    } else if (mobileQuery.addListener) {
      mobileQuery.addListener(handleMobileChange);
    }

    window.addEventListener('resize', initBottomNavPill);
    window.addEventListener('load', initBottomNavPill);
  }
})();
