// ============================================================
// BREADWINNER — home.js
// No AI/backend wired up yet — this renders the dashboard from
// a small set of sample receipts so the UI can be judged on its
// own. Swap MOCK_RECEIPTS for real scanned data later.
// ============================================================

(function () {
  // ---------- Auth guard (fake) ----------
  const user = JSON.parse(localStorage.getItem('breadwinner_user') || 'null');
  document.getElementById('greeting').textContent = user
    ? `Welcome back, ${user.name.split(' ')[0]}`
    : 'Welcome back';

  document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('breadwinner_user');
    window.location.href = 'index.html';
  });

  // ---------- Sample ledger data ----------
  // flag: 'gluten'      -> contains gluten, not deductible
  //       'gf-plain'    -> gluten-free, ordinary substitute, not deductible
  //       'gf-deduct'   -> gluten-free specialty item, deductible premium
  const MOCK_RECEIPTS = [
    {
      id: 'r1', store: "Trader Lou's", date: 'Jul 2, 2026',
      items: [
        { name: 'Oat Bread Loaf', price: 6.49, flag: 'gf-deduct', overcharge: 3.10 },
        { name: 'Barley Malt Cereal', price: 4.29, flag: 'gluten' },
        { name: 'GF Pasta 12oz', price: 5.99, flag: 'gf-deduct', overcharge: 2.40 },
        { name: 'Soy Sauce (wheat)', price: 3.19, flag: 'gluten' },
        { name: 'Almond Flour 2lb', price: 9.99, flag: 'gf-deduct', overcharge: 4.20 },
        { name: 'Rice Crackers', price: 4.49, flag: 'gf-plain' },
      ],
    },
    {
      id: 'r2', store: 'Green Valley Market', date: 'Jun 27, 2026',
      items: [
        { name: 'Sourdough Baguette', price: 3.99, flag: 'gluten' },
        { name: 'GF All-Purpose Flour', price: 8.49, flag: 'gf-deduct', overcharge: 3.80 },
        { name: 'Whole Milk 1gal', price: 4.19, flag: 'gf-plain' },
        { name: 'GF Soy Sauce', price: 5.29, flag: 'gf-deduct', overcharge: 2.10 },
        { name: 'Beer, 6-pack', price: 9.99, flag: 'gluten' },
        { name: 'Corn Tortillas', price: 3.29, flag: 'gf-plain' },
      ],
    },
    {
      id: 'r3', store: 'Fresh Fields Co-op', date: 'Jun 20, 2026',
      items: [
        { name: 'GF Sandwich Bread', price: 7.29, flag: 'gf-deduct', overcharge: 4.50 },
        { name: 'Wheat Crackers', price: 3.79, flag: 'gluten' },
        { name: 'GF Pretzels', price: 4.99, flag: 'gf-deduct', overcharge: 2.60 },
        { name: 'Bananas, bunch', price: 1.89, flag: 'gf-plain' },
        { name: 'Malted Milk Powder', price: 5.49, flag: 'gluten' },
      ],
    },
    {
      id: 'r4', store: "Trader Lou's", date: 'Jun 14, 2026',
      items: [
        { name: 'GF Bagels, 4ct', price: 6.99, flag: 'gf-deduct', overcharge: 3.30 },
        { name: 'Cream Cheese', price: 3.49, flag: 'gf-plain' },
        { name: 'Regular Bagels, 6ct', price: 3.99, flag: 'gluten' },
        { name: 'GF Oat Crackers', price: 5.49, flag: 'gf-deduct', overcharge: 2.90 },
      ],
    },
  ];

  // ---------- Derived stats ----------
  const allItems = MOCK_RECEIPTS.flatMap((r) => r.items);
  const glutenItems = allItems.filter((i) => i.flag === 'gluten');
  const deductibleItems = allItems.filter((i) => i.flag === 'gf-deduct');
  const totalOvercharge = deductibleItems.reduce((sum, i) => sum + i.overcharge, 0);
  const avgOvercharge = deductibleItems.length ? totalOvercharge / deductibleItems.length : 0;

  function receiptTotalOvercharge(receipt) {
    return receipt.items
      .filter((i) => i.flag === 'gf-deduct')
      .reduce((sum, i) => sum + i.overcharge, 0);
  }
  function receiptGlutenCount(receipt) {
    return receipt.items.filter((i) => i.flag === 'gluten').length;
  }

  // ---------- Render stat cards ----------
  const statsGrid = document.getElementById('stats-grid');
  const stats = [
    { label: 'Receipts scanned', value: MOCK_RECEIPTS.length, unit: '', glyph: '⎘' },
    { label: 'Gluten items detected', value: glutenItems.length, unit: '', glyph: '⚑' },
    { label: 'Total overcharge', value: totalOvercharge.toFixed(2), unit: '$', glyph: '◈' },
    { label: 'Avg. overcharge / item', value: avgOvercharge.toFixed(2), unit: '$', glyph: '≈' },
  ];

  statsGrid.innerHTML = stats.map((s, i) => `
    <div class="stat-card" style="animation-delay:${i * 70}ms">
      <span class="stat-card__glyph">${s.glyph}</span>
      <p class="stat-card__label">${s.label}</p>
      <p class="stat-card__value">${s.unit}<span>${s.value}</span></p>
    </div>
  `).join('');

  // ---------- Render receipt rows ----------
  const list = document.getElementById('receipts-list');
  const emptyMsg = document.getElementById('receipts-empty');

  if (!MOCK_RECEIPTS.length) {
    emptyMsg.hidden = false;
  } else {
    list.innerHTML = MOCK_RECEIPTS.map((r, i) => `
      <button class="receipt-row" role="listitem" data-id="${r.id}" style="animation-delay:${i * 60}ms">
        <span class="receipt-row__thumb" aria-hidden="true">🧾</span>
        <span class="receipt-row__info">
          <span class="receipt-row__store">${r.store}</span>
          <span class="receipt-row__meta">${r.date} · ${r.items.length} items</span>
        </span>
        <span class="receipt-row__count">${receiptGlutenCount(r)} flagged</span>
        <span class="receipt-row__overcharge">+$${receiptTotalOvercharge(r).toFixed(2)}</span>
        <span class="receipt-row__chevron">›</span>
      </button>
    `).join('');
  }

  // ---------- Modal ----------
  const modal = document.getElementById('receipt-modal');
  const modalBody = document.getElementById('modal-body');
  const modalBackdrop = document.getElementById('modal-backdrop');
  const modalClose = document.getElementById('modal-close');

  function badgeFor(flag) {
    if (flag === 'gluten') return '<span class="badge badge--gluten">Contains gluten</span>';
    if (flag === 'gf-deduct') return '<span class="badge badge--deductible">Deductible</span>';
    return '<span class="badge badge--gf">Gluten-free</span>';
  }

  function openReceipt(id) {
    const r = MOCK_RECEIPTS.find((x) => x.id === id);
    if (!r) return;

    modalBody.innerHTML = `
      <div class="modal__receipt-visual">
        <p class="modal__store">${r.store}</p>
        <p class="modal__date">${r.date}</p>
        <div class="modal__items">
          ${r.items.map((i) => `
            <div class="modal__item">
              ${badgeFor(i.flag)}
              <span class="modal__item-name">${i.name}</span>
              <span class="modal__item-price">$${i.price.toFixed(2)}${i.flag === 'gf-deduct' ? ` <span style="color:var(--rose)">(+$${i.overcharge.toFixed(2)})</span>` : ''}</span>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="modal__summary">
        <span class="modal__summary-label">Total overcharge on this receipt</span>
        <span class="modal__summary-value">$${receiptTotalOvercharge(r).toFixed(2)}</span>
      </div>
    `;


    modalClose.focus();
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');

  }

  function closeModal() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }

  list.addEventListener('click', (e) => {
    const row = e.target.closest('.receipt-row');
    if (row) openReceipt(row.dataset.id);
  });

  modalBackdrop.addEventListener('click', closeModal);
  modalClose.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // "Scan a receipt" is a placeholder until the vision API is wired up.
  document.getElementById('scan-btn').addEventListener('click', () => {
    alert('Receipt scanning connects here once the AI integration is wired up.');
  });
})();