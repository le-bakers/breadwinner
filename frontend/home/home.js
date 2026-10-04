/* ============================================
   BreadWinner â€” Dashboard JS
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
    frag.querySelector('.cell-date').textContent = dateFormatter.format(new Date(receipt.date));
    frag.querySelector('.cell-items').textContent = receipt.items;
    frag.querySelector('.cell-gf').textContent = receipt.gfItems;
    if (receipt.imageUrl) {
      frag.querySelector('.expand-receipt-img').src = receipt.imageUrl;
    }

    const overchargeCell = frag.querySelector('.cell-overcharge');
    overchargeCell.textContent = receipt.overcharge > 0 ? money(receipt.overcharge) : 'â€”';
    overchargeCell.classList.toggle('zero', receipt.overcharge === 0);

    const statusCell = frag.querySelector('.cell-status');
    const pill = document.createElement('span');
    pill.className = 'status-pill ' + (receipt.status === 'processed' ? 'status-processed' : 'status-review');
    pill.textContent = receipt.status === 'processed' ? 'Processed' : 'Needs Review';
    statusCell.appendChild(pill);

    const list = frag.querySelector('.expand-item-list');
    receipt.lines.forEach((line) => {
      const li = document.createElement('li');
      const mark = document.createElement('span');
      mark.className = 'item-mark ' + (line.gf ? 'yes' : 'no');
      mark.innerHTML = line.gf
        ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        : '<svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';

      const name = document.createElement('span');
      name.className = 'item-name';
      name.textContent = line.name;

      const badges = document.createElement('span');
      badges.style.display = 'flex';
      badges.style.gap = '6px';
      if (line.gf) {
        const b = document.createElement('span'); b.className = 'badge badge-gf'; b.textContent = 'GF'; badges.appendChild(b);
      }
      if (line.tax) {
        const b = document.createElement('span'); b.className = 'badge badge-tax'; b.textContent = 'Tax Deductible'; badges.appendChild(b);
      }

      const price = document.createElement('span');
      price.className = 'item-price';
      price.textContent = money(line.price);

      li.appendChild(mark);
      li.appendChild(name);
      li.appendChild(badges);
      li.appendChild(price);
      list.appendChild(li);
    });

    row.addEventListener('click', () => toggleRow(row, expand));
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleRow(row, expand); }
    });

    return frag;
  }

  function toggleRow(row, expand) {
    const isOpen = row.classList.toggle('open');
    expand.classList.toggle('open', isOpen);
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
    window.BreadWinner.staggerReveal('.stat-card', 80);
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
    cameraFooter.hidden = true;
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

  function addReceiptToHistory(imageUrl) {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const storeName = 'Captured Receipt';

    const newReceipt = {
      name: storeName,
      date: dateStr,
      items: 0,
      gfItems: 0,
      overcharge: 0,
      status: 'review',
      lines: [],
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
    try {
      addReceiptToHistory(await blobToDataUrl(capturedBlob));
    } catch (error) {
      cameraConfirmBtn.disabled = false;
      if (cameraStatus) cameraStatus.textContent = 'Could not save photo';
    }
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
      try { addReceiptToHistory(await blobToDataUrl(file)); }
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
