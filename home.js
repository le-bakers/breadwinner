/* ============================================
   BreadWinner — Dashboard JS
   ============================================ */

(function () {
  'use strict';

  /* ---------- Placeholder data ---------- */
  const RECEIPTS = [
    {
      name: 'Whole Foods Market', date: '2026-07-03', items: 14, gfItems: 9,
      overcharge: 4.20, status: 'processed',
      lines: [
        { name: 'GF Bread Loaf', gf: true, tax: true, price: 6.49 },
        { name: 'Bananas', gf: true, tax: false, price: 1.28 },
        { name: 'GF Pasta', gf: true, tax: true, price: 5.99 },
        { name: 'Wheat Crackers', gf: false, tax: false, price: 3.49 },
        { name: 'GF All-Purpose Flour', gf: true, tax: true, price: 7.29 },
      ]
    },
    {
      name: 'Trader Joe\'s', date: '2026-06-28', items: 21, gfItems: 12,
      overcharge: 6.80, status: 'processed',
      lines: [
        { name: 'GF Oat Cereal', gf: true, tax: true, price: 4.79 },
        { name: 'Almond Milk', gf: true, tax: false, price: 3.49 },
        { name: 'Regular Bagels', gf: false, tax: false, price: 3.99 },
        { name: 'GF Tortillas', gf: true, tax: true, price: 5.49 },
      ]
    },
    {
      name: 'Safeway', date: '2026-06-21', items: 9, gfItems: 3,
      overcharge: 0, status: 'review',
      lines: [
        { name: 'Eggs (dozen)', gf: true, tax: false, price: 4.29 },
        { name: 'GF Cookies', gf: true, tax: true, price: 6.99 },
        { name: 'Soy Sauce', gf: false, tax: false, price: 2.99 },
      ]
    },
    {
      name: 'Costco Wholesale', date: '2026-06-14', items: 32, gfItems: 18,
      overcharge: 11.40, status: 'processed',
      lines: [
        { name: 'GF Pizza Crust (3pk)', gf: true, tax: true, price: 12.99 },
        { name: 'GF Chicken Tenders', gf: true, tax: true, price: 15.49 },
        { name: 'Paper Towels', gf: false, tax: false, price: 18.99 },
        { name: 'GF Pretzels', gf: true, tax: true, price: 8.49 },
      ]
    },
    {
      name: 'Sprouts Farmers Market', date: '2026-06-07', items: 11, gfItems: 8,
      overcharge: 2.10, status: 'processed',
      lines: [
        { name: 'GF Bagels', gf: true, tax: true, price: 5.99 },
        { name: 'Spinach', gf: true, tax: false, price: 2.49 },
        { name: 'GF Granola', gf: true, tax: true, price: 6.29 },
      ]
    },
    {
      name: 'Kroger', date: '2026-05-30', items: 17, gfItems: 6,
      overcharge: 3.55, status: 'review',
      lines: [
        { name: 'GF English Muffins', gf: true, tax: true, price: 5.49 },
        { name: 'Ground Beef', gf: true, tax: false, price: 9.99 },
        { name: 'Regular Pasta', gf: false, tax: false, price: 1.79 },
      ]
    },
  ];

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
    table.querySelectorAll('.receipt-row:not(.receipt-row-head), .receipt-expand').forEach((el) => el.remove());
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
  const cameraInput = document.getElementById('cameraInput');
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

  /* ---------- Take Photo ---------- */
  const photoBtn = document.getElementById('fabTakePhoto');
  if (photoBtn && cameraInput) {
    photoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeFab();
      cameraInput.click();
    });
    cameraInput.addEventListener('change', () => {
      if (cameraInput.files.length > 0) {
        // Simulate photo capture — in production, send to server
        console.log('Photo captured:', cameraInput.files[0].name);
        cameraInput.value = '';
      }
    });
  }
})();
