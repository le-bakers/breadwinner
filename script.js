(function () {
  'use strict';

  /* ============================================
     Element references
     ============================================ */
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const cameraInput = document.getElementById('camera-input');
  const uploadBtn = document.getElementById('upload-btn');
  const cameraBtn = document.getElementById('camera-btn');
  const heroScanBtn = document.getElementById('hero-scan-btn');

  const scanIdle = document.getElementById('scan-idle');
  const scanPreview = document.getElementById('scan-preview');
  const scanLoading = document.getElementById('scan-loading');
  const scanError = document.getElementById('scan-error');
  const previewImage = document.getElementById('preview-image');
  const analyzeBtn = document.getElementById('analyze-btn');
  const retakeBtn = document.getElementById('retake-btn');
  const errorText = document.getElementById('error-text');
  const errorRetryBtn = document.getElementById('error-retry-btn');
  const loadingText = document.getElementById('loading-text');

  const resultsSection = document.getElementById('results-section');
  const receiptStore = document.getElementById('receipt-store');
  const receiptDate = document.getElementById('receipt-date');
  const listGluten = document.getElementById('list-gluten');
  const listSafe = document.getElementById('list-safe');
  const listDeductible = document.getElementById('list-deductible');
  const grandTotalEl = document.getElementById('grand-total');
  const glutenTotalEl = document.getElementById('gluten-total');
  const safeTotalEl = document.getElementById('safe-total');
  const deductibleTotalEl = document.getElementById('deductible-total');
  const glutenCountEl = document.getElementById('gluten-count');
  const safeCountEl = document.getElementById('safe-count');
  const deductibleCountEl = document.getElementById('deductible-count');

  const shareBtn = document.getElementById('share-btn');
  const printBtn = document.getElementById('print-btn');
  const scanAnotherBtn = document.getElementById('scan-another-btn');

  const settingsBtn = document.getElementById('settings-btn');
  const settingsDialog = document.getElementById('settings-dialog');
  const settingsBackdrop = document.getElementById('settings-backdrop');
  const apiKeyInput = document.getElementById('api-key-input');
  const showKeyCheckbox = document.getElementById('show-key-checkbox');
  const saveKeyBtn = document.getElementById('save-key-btn');
  const closeSettingsBtn = document.getElementById('close-settings-btn');

  const liveRegion = document.getElementById('live-region');

  const STORAGE_KEY = 'breadwinner_api_key';
  const MODEL = 'claude-sonnet-4-6';

  let currentImageBase64 = null;
  let currentImageMediaType = null;
  let lastResults = null;

  /* ============================================
     Settings dialog
     ============================================ */
  function openSettings() {
    apiKeyInput.value = localStorage.getItem(STORAGE_KEY) || '';
    settingsBackdrop.hidden = false;
    settingsDialog.hidden = false;
    apiKeyInput.focus();
  }
  function closeSettings() {
    settingsBackdrop.hidden = true;
    settingsDialog.hidden = true;
    settingsBtn.focus();
  }
  settingsBtn.addEventListener('click', openSettings);
  closeSettingsBtn.addEventListener('click', closeSettings);
  settingsBackdrop.addEventListener('click', closeSettings);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !settingsDialog.hidden) closeSettings();
  });
  showKeyCheckbox.addEventListener('change', () => {
    apiKeyInput.type = showKeyCheckbox.checked ? 'text' : 'password';
  });
  saveKeyBtn.addEventListener('click', () => {
    const val = apiKeyInput.value.trim();
    if (val) {
      localStorage.setItem(STORAGE_KEY, val);
      announce('API key saved.');
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    closeSettings();
  });

  function getApiKey() {
    return localStorage.getItem(STORAGE_KEY) || '';
  }

  /* ============================================
     Screen state helpers
     ============================================ */
  function showScreen(name) {
    scanIdle.hidden = name !== 'idle';
    scanPreview.hidden = name !== 'preview';
    scanLoading.hidden = name !== 'loading';
    scanError.hidden = name !== 'error';
  }

  function announce(msg) {
    liveRegion.textContent = msg;
  }

  /* ============================================
     File handling
     ============================================ */
  heroScanBtn.addEventListener('click', () => {
    document.getElementById('scan').scrollIntoView({ behavior: 'smooth' });
    dropZone.focus();
  });

  uploadBtn.addEventListener('click', () => fileInput.click());
  cameraBtn.addEventListener('click', () => cameraInput.click());
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
  cameraInput.addEventListener('change', (e) => handleFile(e.target.files[0]));

  ['dragenter', 'dragover'].forEach((evt) => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach((evt) => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    });
  });
  dropZone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      showError('That file doesn\'t look like an image. Please choose a photo of your receipt.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const [meta, base64] = dataUrl.split(',');
      currentImageMediaType = meta.match(/data:(.*);base64/)[1];
      currentImageBase64 = base64;
      previewImage.src = dataUrl;
      showScreen('preview');
    };
    reader.onerror = () => {
      showError('We couldn\'t open that photo. Please try a different one.');
    };
    reader.readAsDataURL(file);
  }

  retakeBtn.addEventListener('click', () => {
    currentImageBase64 = null;
    currentImageMediaType = null;
    fileInput.value = '';
    cameraInput.value = '';
    showScreen('idle');
  });

  errorRetryBtn.addEventListener('click', () => {
    if (currentImageBase64) {
      showScreen('preview');
    } else {
      showScreen('idle');
    }
  });

  function showError(message) {
    errorText.textContent = message;
    showScreen('error');
    announce(message);
  }

  /* ============================================
     Analyze receipt via Claude Vision API
     ============================================ */
  analyzeBtn.addEventListener('click', analyzeReceipt);

  const SYSTEM_PROMPT = `You are a careful grocery receipt reader for someone with celiac disease. You will be shown a photo of a grocery store receipt. Read every purchased line item you can make out (ignore subtotals, tax lines, loyalty numbers, and payment details).

For each item, decide one category:
- "gluten": the product very likely contains gluten (wheat, barley, rye, malt, regular flour/bread/pasta/cereal, most soy sauce, beer, etc.), or is a store item with no gluten-free indication and gluten is a common ingredient in that product type.
- "gluten_free": the product is naturally gluten-free or labeled/certified gluten-free, and is priced the same as any regular grocery item (produce, plain meat, dairy, rice, naturally GF snacks, everyday household goods, etc.) — not a specialty substitute product.
- "gf_specialty": the product is a gluten-free specialty substitute product (e.g. gluten-free bread, gluten-free pasta, gluten-free flour blend, gluten-free crackers/cookies labeled gluten-free) that typically costs more than its regular wheat-based equivalent, making it potentially tax-deductible as a medical expense for someone with celiac disease.
- "unclear": you genuinely cannot tell from the receipt text alone.

Respond with ONLY minified JSON, no markdown fences, no commentary, in exactly this shape:
{"store":"<store name or 'Grocery Receipt' if unknown>","date":"<date on receipt or ''>","items":[{"name":"<item name, cleaned up and title-cased>","price":<number>,"category":"gluten|gluten_free|gf_specialty|unclear"}]}

Rules:
- price must be a plain number (no currency symbol), using the price actually charged for that line (after any discount shown on that line).
- If you cannot read the receipt at all, return {"store":"","date":"","items":[]}.
- Never include subtotal, tax, total, or payment-method lines as items.
- Keep item names short and human-readable, not the abbreviated register text.`;

  async function analyzeReceipt() {
    const apiKey = getApiKey();
    if (!apiKey) {
      openSettings();
      announce('Please add your Claude API key first.');
      return;
    }
    showScreen('loading');
    loadingText.textContent = 'Reading your receipt…';

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 2000,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: currentImageMediaType,
                    data: currentImageBase64
                  }
                },
                {
                  type: 'text',
                  text: 'Read this grocery receipt and return the JSON described in your instructions.'
                }
              ]
            }
          ]
        })
      });

      if (!response.ok) {
        const errBody = await response.text();
        let friendly = 'We couldn\'t reach the reading service. Please try again in a moment.';
        if (response.status === 401) friendly = 'That API key was not accepted. Please check it in Settings.';
        if (response.status === 429) friendly = 'Too many requests right now. Please wait a moment and try again.';
        console.error('API error', response.status, errBody);
        showError(friendly);
        return;
      }

      const data = await response.json();
      const textBlock = (data.content || []).find((b) => b.type === 'text');
      if (!textBlock) {
        showError('We didn\'t get a readable response. Please try again.');
        return;
      }

      let parsed;
      try {
        const cleaned = textBlock.text.replace(/```json|```/g, '').trim();
        parsed = JSON.parse(cleaned);
      } catch (e) {
        console.error('Parse error', e, textBlock.text);
        showError('We had trouble understanding that receipt. A clearer photo often helps.');
        return;
      }

      if (!parsed.items || parsed.items.length === 0) {
        showError('We couldn\'t find any items on that receipt. Try a clearer, well-lit photo.');
        return;
      }

      renderResults(parsed);
      showScreen('idle');
      fileInput.value = '';
      cameraInput.value = '';
      currentImageBase64 = null;
      currentImageMediaType = null;

    } catch (err) {
      console.error(err);
      showError('We couldn\'t connect to the reading service. Check your connection and try again.');
    }
  }

  /* ============================================
     Render results
     ============================================ */
  function formatMoney(n) {
    return '$' + n.toFixed(2);
  }

  function renderResults(data) {
    lastResults = data;

    receiptStore.textContent = data.store && data.store.trim() ? data.store : 'Grocery Receipt';
    receiptDate.textContent = data.date && data.date.trim() ? data.date : new Date().toLocaleDateString();

    const groups = { gluten: [], gluten_free: [], gf_specialty: [], unclear: [] };
    data.items.forEach((item) => {
      const cat = groups[item.category] ? item.category : 'unclear';
      groups[cat].push(item);
    });

    // Merge unclear into gluten_free-safe list visually as "safe" isn't accurate;
    // instead list unclear items alongside gluten-free-safe with a caveat in name.
    const safeItems = groups.gluten_free.concat(
      groups.unclear.map((i) => ({ ...i, name: i.name + ' (unconfirmed)' }))
    );

    fillList(listGluten, groups.gluten);
    fillList(listSafe, safeItems);
    fillList(listDeductible, groups.gf_specialty);

    const glutenTotal = sumPrices(groups.gluten);
    const safeTotal = sumPrices(safeItems);
    const deductibleTotal = sumPrices(groups.gf_specialty);
    const grandTotal = glutenTotal + safeTotal + deductibleTotal;

    glutenTotalEl.textContent = formatMoney(glutenTotal);
    safeTotalEl.textContent = formatMoney(safeTotal);
    deductibleTotalEl.textContent = formatMoney(deductibleTotal);
    grandTotalEl.textContent = formatMoney(grandTotal);

    glutenCountEl.textContent = countLabel(groups.gluten.length);
    safeCountEl.textContent = countLabel(safeItems.length);
    deductibleCountEl.textContent = countLabel(groups.gf_specialty.length);

    resultsSection.hidden = false;
    resultsSection.scrollIntoView({ behavior: 'smooth' });
    announce('Receipt read. Results are ready below.');
  }

  function countLabel(n) {
    return n === 1 ? '1 item' : n + ' items';
  }

  function sumPrices(items) {
    return items.reduce((sum, i) => sum + (typeof i.price === 'number' ? i.price : parseFloat(i.price) || 0), 0);
  }

  function fillList(ul, items) {
    ul.innerHTML = '';
    if (items.length === 0) {
      const li = document.createElement('li');
      li.innerHTML = '<span class="empty-note">Nothing in this category</span>';
      ul.appendChild(li);
      return;
    }
    items.forEach((item) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'item-name';
      name.textContent = item.name;
      const price = document.createElement('span');
      price.className = 'item-price';
      const priceNum = typeof item.price === 'number' ? item.price : parseFloat(item.price) || 0;
      price.textContent = formatMoney(priceNum);
      li.appendChild(name);
      li.appendChild(price);
      ul.appendChild(li);
    });
  }

  /* ============================================
     Results actions
     ============================================ */
  scanAnotherBtn.addEventListener('click', () => {
    resultsSection.hidden = true;
    document.getElementById('scan').scrollIntoView({ behavior: 'smooth' });
  });

  printBtn.addEventListener('click', () => window.print());

  shareBtn.addEventListener('click', async () => {
    if (!lastResults) return;
    const text = buildShareText(lastResults);
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Breadwinner receipt summary', text });
      } catch (e) {
        /* user cancelled share; no action needed */
      }
    } else {
      try {
        await navigator.clipboard.writeText(text);
        announce('Summary copied to clipboard.');
      } catch (e) {
        showError('Sharing isn\'t supported on this device.');
      }
    }
  });

  function buildShareText(data) {
    const lines = [];
    lines.push((data.store || 'Grocery Receipt') + (data.date ? ' — ' + data.date : ''));
    lines.push('');
    ['gluten', 'gluten_free', 'gf_specialty', 'unclear'].forEach((cat) => {
      const items = data.items.filter((i) => i.category === cat);
      if (items.length === 0) return;
      const label = { gluten: 'Contains gluten', gluten_free: 'Gluten-free & safe', gf_specialty: 'Tax-deductible GF specialty', unclear: 'Unconfirmed' }[cat];
      lines.push(label + ':');
      items.forEach((i) => lines.push('  ' + i.name + ' — ' + formatMoney(parseFloat(i.price) || 0)));
      lines.push('');
    });
    const grand = sumPrices(data.items);
    lines.push('Grand total: ' + formatMoney(grand));
    return lines.join('\n');
  }

})();