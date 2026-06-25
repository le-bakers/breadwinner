var uploadedBase64 = null;
  var uploadedMime = null;

  var uploadZone    = document.getElementById('upload-zone');
  var fileInput     = document.getElementById('file-input');
  var previewImg    = document.getElementById('preview-img');
  var scanBtn       = document.getElementById('scan-btn');
  var clearBtn      = document.getElementById('clear-btn');
  var loadingState  = document.getElementById('loading-state');
  var loadingText   = document.getElementById('loading-text');
  var resultsSection = document.getElementById('results-section');
  var errorBox      = document.getElementById('error-box');
  var howItWorks    = document.getElementById('how-it-works');
  var exportBtn     = document.getElementById('export-btn');
  var scanAnotherBtn = document.getElementById('scan-another-btn');

  fileInput.addEventListener('change', function(e) {
    var f = e.target.files[0];
    if (f) processFile(f);
  });

  uploadZone.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });

  uploadZone.addEventListener('dragover', function(e) { e.preventDefault(); uploadZone.classList.add('drag-over'); });
  uploadZone.addEventListener('dragleave', function() { uploadZone.classList.remove('drag-over'); });
  uploadZone.addEventListener('drop', function(e) {
    e.preventDefault(); uploadZone.classList.remove('drag-over');
    var f = e.dataTransfer.files[0];
    if (f) processFile(f);
  });

  function processFile(f) {
    uploadedMime = f.type || 'image/jpeg';
    var reader = new FileReader();
    reader.onload = function(ev) {
      var dataUrl = ev.target.result;
      uploadedBase64 = dataUrl.split(',')[1];
      if (f.type.startsWith('image/')) {
        previewImg.src = dataUrl;
        previewImg.style.display = 'block';
      } else {
        previewImg.style.display = 'none';
      }
      scanBtn.disabled = false;
      clearBtn.style.display = 'flex';
      hideError();
    };
    reader.readAsDataURL(f);
  }

  clearBtn.addEventListener('click', resetApp);
  scanAnotherBtn.addEventListener('click', resetApp);

  function resetApp() {
    uploadedBase64 = null; uploadedMime = null;
    fileInput.value = '';
    previewImg.src = ''; previewImg.style.display = 'none';
    scanBtn.disabled = true;
    clearBtn.style.display = 'none';
    loadingState.style.display = 'none';
    resultsSection.style.display = 'none';
    howItWorks.style.display = '';
    hideError();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  var loadingMessages = [
    'Reading your receipt…',
    'Identifying food items…',
    'Checking for gluten sources…',
    'Calculating deductions…'
  ];

  scanBtn.addEventListener('click', runScan);

  async function runScan() {
    if (!uploadedBase64) return;
    hideError();
    setLoading(true);
    howItWorks.style.display = 'none';

    var msgIdx = 0;
    var msgInterval = setInterval(function() {
      msgIdx = (msgIdx + 1) % loadingMessages.length;
      loadingText.textContent = loadingMessages[msgIdx];
    }, 2200);

    var prompt = 'You are a celiac disease dietary assistant and tax helper. Analyze this grocery receipt image.\n\nExtract EVERY line item visible on the receipt. For each item determine:\n1. Whether it likely contains gluten (wheat, barley, rye, malt, triticale, spelt, kamut, semolina, farro, bulgur, durum, einkorn, emmer, farina, graham flour, wheat starch, wheat bran, wheat germ, hydrolyzed wheat protein, brewers yeast). Regular oats may be cross-contaminated.\n2. Whether it is tax-deductible for a person with celiac disease: gluten-free specialty products (labeled GF, gluten-free breads, GF pasta, GF crackers, GF cereals, GF flour, etc.) that cost more than their gluten-containing equivalents qualify as a medical expense deduction. Naturally gluten-free foods (fresh produce, plain meat, rice, plain dairy, eggs) do NOT qualify because there is no price premium.\n3. The price of the item.\n\nReturn ONLY a JSON object (no markdown, no explanation) with this exact structure:\n{\n  "store": "Store name or Unknown",\n  "date": "Date on receipt or Unknown",\n  "items": [\n    {\n      "name": "Product name",\n      "price": 4.99,\n      "hasGluten": true,\n      "isTaxDeductible": false,\n      "note": "Brief reason"\n    }\n  ],\n  "receiptTotal": 0.00\n}\n\nIf price is not readable set it to 0.00. Include ALL items.';

    try {
      var resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: uploadedMime, data: uploadedBase64 }
              },
              { type: 'text', text: prompt }
            ]
          }]
        })
      });

      clearInterval(msgInterval);

      if (!resp.ok) {
        var err = await resp.json().catch(function() { return {}; });
        throw new Error((err.error && err.error.message) || ('API error ' + resp.status));
      }

      var data = await resp.json();
      var text = data.content.map(function(b) { return b.text || ''; }).join('');

      var parsed;
      try {
        var clean = text.replace(/```json|```/g, '').trim();
        parsed = JSON.parse(clean);
      } catch(e) {
        throw new Error('Could not read the receipt clearly. Please try a brighter, clearer photo.');
      }

      setLoading(false);
      renderResults(parsed);

    } catch(err) {
      clearInterval(msgInterval);
      setLoading(false);
      showError(err.message || 'Something went wrong. Please try again.');
    }
  }

  function renderResults(data) {
    var items = data.items || [];
    var glutenItems = items.filter(function(i) { return i.hasGluten; });
    var safeItems   = items.filter(function(i) { return !i.hasGluten; });
    var deductItems = items.filter(function(i) { return i.isTaxDeductible; });

    function sum(arr) { return arr.reduce(function(t,i) { return t + (parseFloat(i.price) || 0); }, 0); }

    document.getElementById('tile-safe-count').textContent   = safeItems.length;
    document.getElementById('tile-gluten-count').textContent = glutenItems.length;
    document.getElementById('tile-deduct-count').textContent = deductItems.length;

    renderList('gluten-list', 'gluten-section', glutenItems, 'danger');
    renderList('safe-list',   'safe-section',   safeItems,   'sage');
    renderList('deduct-list', 'deduct-section', deductItems, 'gold');

    document.getElementById('total-safe').textContent   = fmt(sum(safeItems));
    document.getElementById('total-gluten').textContent = fmt(sum(glutenItems));
    document.getElementById('total-deduct').textContent = fmt(sum(deductItems));
    document.getElementById('total-all').textContent    = fmt(data.receiptTotal || sum(items));

    var dCount = deductItems.length;
    if (dCount > 0) {
      document.getElementById('deduct-callout-text').innerHTML =
        'You may be able to deduct the GF premium cost of <strong>' + dCount + ' item' + (dCount > 1 ? 's' : '') + '</strong> (totalling <strong>' + fmt(sum(deductItems)) + '</strong>) as a medical expense. Save this summary and share with your tax professional.';
    }

    resultsSection.style.display = 'block';
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderList(listId, sectionId, items, color) {
    var section = document.getElementById(sectionId);
    var list = document.getElementById(listId);
    list.innerHTML = '';
    if (items.length === 0) { section.style.display = 'none'; return; }
    section.style.display = 'block';

    items.forEach(function(item) {
      var row = document.createElement('div');
      row.className = 'item-row';
      var priceClass = color === 'danger' ? 'danger-price' : color === 'sage' ? 'sage-price' : 'gold-price';

      var badges = '';
      if (item.hasGluten) badges += '<span class="badge badge-danger">Contains Gluten</span>';
      if (item.isTaxDeductible) badges += '<span class="badge badge-gold">Tax Deductible</span>';
      if (!item.hasGluten && !item.isTaxDeductible) badges += '<span class="badge badge-sage">Naturally GF</span>';

      row.innerHTML =
        '<div class="item-info">' +
          '<div class="item-name">' + escHtml(item.name) + '</div>' +
          (item.note ? '<div class="item-note">' + escHtml(item.note) + '</div>' : '') +
          '<div>' + badges + '</div>' +
        '</div>' +
        '<div class="item-price ' + priceClass + '">' + fmt(item.price) + '</div>';

      list.appendChild(row);
    });
  }

  exportBtn.addEventListener('click', function() {
    var lines = [
      'BREADWINNER – Receipt Scan Summary',
      'Date: ' + new Date().toLocaleDateString(),
      '─────────────────────────────────',
      '✅ Gluten-Free Safe Items:  ' + document.getElementById('tile-safe-count').textContent,
      '⚠️  Contains Gluten:        ' + document.getElementById('tile-gluten-count').textContent,
      '💰 Tax-Deductible Items:   ' + document.getElementById('tile-deduct-count').textContent,
      '💰 Est. Deductible Amount: ' + document.getElementById('total-deduct').textContent,
      '🧾 Receipt Total:          ' + document.getElementById('total-all').textContent,
      '─────────────────────────────────',
      'Tax info is an estimate. Consult a tax professional.',
      'Generated by Breadwinner'
    ].join('\n');

    if (navigator.share) {
      navigator.share({ title: 'Breadwinner Receipt Summary', text: lines }).catch(function() {});
    } else {
      navigator.clipboard.writeText(lines).then(function() {
        exportBtn.textContent = '✓ Copied to clipboard!';
        setTimeout(function() { exportBtn.innerHTML = '📄 Save / Share Summary'; }, 2500);
      }).catch(function() { alert(lines); });
    }
  });

  function fmt(n) { return '$' + (parseFloat(n) || 0).toFixed(2); }
  function escHtml(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function setLoading(on) {
    loadingState.style.display = on ? 'flex' : 'none';
    scanBtn.disabled = on;
    clearBtn.style.display = on ? 'none' : 'flex';
    if (on) loadingText.textContent = loadingMessages[0];
  }
  function showError(msg) { errorBox.textContent = '⚠️ ' + msg; errorBox.style.display = 'block'; }
  function hideError() { errorBox.style.display = 'none'; errorBox.textContent = ''; }