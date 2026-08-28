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

  /* ---------- Receipt data (starts empty for new users) ---------- */
  const RECEIPTS = [];

  const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const money = (n) => '$' + n.toFixed(2);

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

    const overchargeCell = frag.querySelector('.cell-overcharge');
    overchargeCell.textContent = receipt.overcharge > 0 ? money(receipt.overcharge) : '—';
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
      empty.textContent = 'No receipts yet — tap the + button to upload your first receipt.';
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

  /* ---------- FAB expand / collapse ---------- */
  const fab = document.getElementById('fabUpload');
  const fabOptions = document.getElementById('fabOptions');
  const fileInput = document.getElementById('fileInput');
  let isOpen = false;

  function toggleFab(e) {
    e.stopPropagation();
    isOpen = !isOpen;
    fabOptions.classList.toggle('open', isOpen);
    fab.setAttribute('aria-expanded', isOpen);
  }

  function closeFab() {
    isOpen = false;
    fabOptions.classList.remove('open');
    fab.setAttribute('aria-expanded', 'false');
  }

  if (fab && fabOptions) {
    fab.addEventListener('click', toggleFab);

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      const wrapper = document.getElementById('fabWrapper');
      if (isOpen && wrapper && !wrapper.contains(e.target)) {
        closeFab();
      }
    });
  }

  /* ---------- Upload Image ---------- */
  const uploadBtn = document.getElementById('fabUploadImage');
  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeFab();
      fileInput.click();
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0) {
        // Simulate upload — in production, send to server
        console.log('File selected:', fileInput.files[0].name);
        fileInput.value = '';
      }
    });
  }

  /* ---------- Camera overlay (Take Photo) ---------- */
  const photoBtn = document.getElementById('fabTakePhoto');
  const cameraOverlay = document.getElementById('cameraOverlay');
  const cameraVideo = document.getElementById('cameraVideo');
  const cameraCanvas = document.getElementById('cameraCanvas');
  const cameraPlaceholder = document.getElementById('cameraPlaceholder');
  const cameraCaptureBtn = document.getElementById('cameraCaptureBtn');
  const cameraPreview = document.getElementById('cameraPreview');
  const cameraPreviewImg = document.getElementById('cameraPreviewImg');
  const cameraClose = document.getElementById('cameraClose');
  const cameraRetakeBtn = document.getElementById('cameraRetakeBtn');
  const cameraConfirmBtn = document.getElementById('cameraConfirmBtn');
  const cameraFooter = document.getElementById('cameraFooter');

  let mediaStream = null;
  let capturedBlob = null;

  function setCameraLoading() {
    cameraPlaceholder.hidden = false;
    cameraPlaceholder.innerHTML = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2v11z" stroke="#6B7280" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="13" r="4" stroke="#6B7280" stroke-width="1.8"/></svg><p>Camera loading...</p>';
  }

  function setCameraError(message) {
    cameraVideo.hidden = true;
    cameraFooter.hidden = true;
    cameraPreview.hidden = true;
    cameraPlaceholder.hidden = false;
    cameraPlaceholder.innerHTML = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#FBBF24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      + '<p class="camera-error-title">Camera unavailable</p>'
      + '<p class="camera-error-msg">' + message + '</p>'
      + '<button type="button" class="btn btn-primary camera-retry">Try Again</button>';
    const retryBtn = cameraPlaceholder.querySelector('.camera-retry');
    if (retryBtn) retryBtn.addEventListener('click', (e) => { e.stopPropagation(); startCamera(); });
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
    return 'This browser can’t access the camera here. Serve the app over HTTPS (or localhost) and make sure camera permissions are allowed.';
  }

  async function startCamera() {
    setCameraLoading();
    cameraFooter.hidden = true;
    cameraPreview.hidden = true;
    try {
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        throw new Error('MediaDevices API unavailable');
      }
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
      cameraVideo.srcObject = mediaStream;
      cameraVideo.hidden = false;
      cameraPlaceholder.hidden = true;
      cameraFooter.hidden = false;
      cameraPreview.hidden = true;
    } catch (err) {
      setCameraError(cameraErrorMessage(err));
    }
  }

  function stopCamera() {
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      mediaStream = null;
    }
    cameraVideo.srcObject = null;
    cameraVideo.hidden = true;
    setCameraLoading();
    cameraFooter.hidden = true;
    cameraPreview.hidden = true;
  }

  function capturePhoto() {
    const video = cameraVideo;
    if (!video.videoWidth || !video.videoHeight) return;
    const canvas = cameraCanvas;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      capturedBlob = blob;
      const url = URL.createObjectURL(blob);
      cameraPreviewImg.src = url;
      cameraVideo.hidden = true;
      cameraPreview.hidden = false;
      cameraFooter.hidden = true;
    }, 'image/jpeg', 0.92);
  }

  function confirmAndAddReceipt() {
    if (!capturedBlob) return;

    // Create a new receipt entry
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const storeName = 'Captured Receipt';

    const newReceipt = {
      name: storeName,
      date: dateStr,
      items: 0,
      gfItems: 0,
      overcharge: 0,
      status: 'review',
      lines: []
    };

    // Add to beginning of RECEIPTS
    RECEIPTS.unshift(newReceipt);

    // Re-render the table
    applyFilters();

    // Close camera
    stopCamera();
    cameraOverlay.hidden = true;

    // Brief success feedback
    const fab = document.getElementById('fabUpload');
    fab.style.background = '#10B981';
    setTimeout(() => { fab.style.background = ''; }, 800);

    capturedBlob = null;
  }

  if (photoBtn && cameraOverlay) {
    photoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeFab();
      cameraOverlay.hidden = false;
      startCamera();
    });

    cameraClose.addEventListener('click', () => {
      stopCamera();
      cameraOverlay.hidden = true;
    });

    cameraOverlay.addEventListener('click', (e) => {
      if (e.target === cameraOverlay) {
        stopCamera();
        cameraOverlay.hidden = true;
      }
    });

    cameraCaptureBtn.addEventListener('click', capturePhoto);
    cameraRetakeBtn.addEventListener('click', retakePhoto);
    cameraConfirmBtn.addEventListener('click', confirmAndAddReceipt);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !cameraOverlay.hidden) {
        stopCamera();
        cameraOverlay.hidden = true;
      }
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
