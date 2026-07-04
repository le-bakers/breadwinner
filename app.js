(() => {
  'use strict';

  // ---------- Element references ----------
  const dropzone       = document.getElementById('dropzone');
  const fileCamera      = document.getElementById('file-camera');
  const fileUpload      = document.getElementById('file-upload');
  const btnCamera       = document.getElementById('btn-camera');
  const btnUpload       = document.getElementById('btn-upload');

  const uploadPanel     = document.getElementById('upload-panel');
  const statusPanel     = document.getElementById('status-panel');
  const statusText      = document.getElementById('status-text');
  const errorPanel      = document.getElementById('error-panel');
  const errorText       = document.getElementById('error-text');
  const resultsPanel    = document.getElementById('results-panel');

  const btnTryAgain     = document.getElementById('btn-try-again');
  const btnNewReceipt   = document.getElementById('btn-new-receipt');
  const btnShare        = document.getElementById('btn-share');

  const receiptStoreEl  = document.getElementById('receipt-store');
  const receiptDateEl   = document.getElementById('receipt-date');
  const receiptItemsEl  = document.getElementById('receipt-items');
  const summaryCountEl  = document.getElementById('summary-count');
  const summaryTotalEl  = document.getElementById('summary-total');
  const summaryGlutenEl = document.getElementById('summary-gluten');
  const summaryDeductEl = document.getElementById('summary-deductible');

  let lastShareText = '';

  // ---------- Helpers ----------
  const money = (n) => `$${Number(n || 0).toFixed(2)}`;

  const showOnly = (panelToShow) => {
    [uploadPanel, statusPanel, errorPanel, resultsPanel].forEach((p) => {
      if (!p) return;
      p.hidden = (p !== panelToShow);
    });
  };

  const setStatus = (message) => {
    statusText.textContent = message;
  };

  const showError = (message) => {
    errorText.textContent = message;
    showOnly(errorPanel);
  };

  // ---------- File intake ----------
  btnCamera.addEventListener('click', () => fileCamera.click());
  btnUpload.addEventListener('click', () => fileUpload.click());

  fileCamera.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
  });
  fileUpload.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
  });

  dropzone.addEventListener('click', () => fileUpload.click());
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileUpload.click();
    }
  });

  ['dragenter', 'dragover'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add('is-dragover');
    });
  });
  ['dragleave', 'drop'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove('is-dragover');
    });
  });
  dropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  btnTryAgain.addEventListener('click', () => showOnly(uploadPanel));
  btnNewReceipt.addEventListener('click', () => showOnly(uploadPanel));

  btnShare.addEventListener('click', async () => {
    if (!lastShareText) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Breadwinner receipt summary', text: lastShareText });
      } catch (err) {
        // User cancelled share sheet; no action needed.
      }
    } else {
      try {
        await navigator.clipboard.writeText(lastShareText);
        setTemporaryLabel(btnShare, 'Copied to clipboard');
      } catch (err) {
        showError('Could not copy the summary. You can select and copy the totals manually.');
      }
    }
  });

  function setTemporaryLabel(button, label) {
    const original = button.innerHTML;
    button.textContent = label;
    setTimeout(() => { button.innerHTML = original; }, 2200);
  }

  // ---------- Main flow ----------
  async function handleFile(file) {
    if (!file.type || !file.type.startsWith('image/')) {
      showError('That file does not look like an image. Please choose a photo of your receipt.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      showError('That photo is quite large. Please choose a smaller photo, under 20 MB.');
      return;
    }

    showOnly(statusPanel);
    setStatus('Reading your receipt…');

    try {
      const { base64, mediaType } = await fileToBase64(file);
      setStatus('Checking each item for gluten and tax-deductible savings…');
      const data = await analyzeReceipt(base64, mediaType);
      renderResults(data);
      showOnly(resultsPanel);
      resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      console.error(err);
      showError(err.message || 'Something went wrong while reading that receipt. Please try again with a clearer photo.');
    }
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result; // data:image/jpeg;base64,XXXX
        const base64 = result.split(',')[1];
        resolve({ base64, mediaType: file.type });
      };
      reader.onerror = () => reject(new Error('We could not open that photo. Please try a different one.'));
      reader.readAsDataURL(file);
    });
  }

  // ---------- Claude API call ----------
  const SYSTEM_PROMPT = `You are a careful assistant reading a photo of a grocery store receipt for a person with celiac disease.

Read every line item you can see on the receipt. For each item, decide:
1. "containsGluten": true if the product is a normal wheat/barley/rye-based food (regular bread, pasta, cereal, crackers, sauces with wheat, etc). false if it is naturally gluten-free (produce, meat, dairy, rice, eggs) or is clearly labeled gluten-free.
2. "taxDeductibleGF": true ONLY if the item is a specialty gluten-free replacement product (e.g. gluten-free bread, gluten-free pasta, gluten-free flour, gluten-free crackers) since in the US the price difference between these and their regular counterparts can sometimes be a deductible medical expense for people with celiac disease. Regular naturally gluten-free whole foods (like fruit, vegetables, plain meat) are NOT tax-deductible specialty items, so mark those false.

Respond with ONLY valid JSON, no markdown fences, no commentary, matching exactly this shape:
{
  "storeName": "string or null if not visible",
  "date": "string as printed on receipt or null",
  "items": [
    { "name": "string", "price": 0.00, "containsGluten": true, "taxDeductibleGF": false }
  ]
}

If the image is not a legible receipt, respond with exactly: {"error": "not_a_receipt"}`;

  async function analyzeReceipt(base64, mediaType) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
              { type: 'text', text: 'Read this grocery receipt and return the JSON described in your instructions.' }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error('We had trouble reaching the scanning service. Please check your connection and try again.');
    }

    const data = await response.json();
    const textBlock = (data.content || []).find((block) => block.type === 'text');
    if (!textBlock) {
      throw new Error('We did not get a readable response. Please try again.');
    }

    const cleaned = textBlock.text.replace(/```json|```/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      throw new Error('We could not make sense of that receipt. Please try a clearer, well-lit photo.');
    }

    if (parsed.error === 'not_a_receipt') {
      throw new Error('That photo does not look like a grocery receipt. Please try again with a clear photo of a receipt.');
    }
    if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
      throw new Error('We could not find any items on that receipt. Please try a clearer photo.');
    }

    return parsed;
  }

  // ---------- Rendering ----------
  function renderResults(data) {
    receiptStoreEl.textContent = data.storeName || 'Grocery receipt';
    receiptDateEl.textContent = data.date || 'Date not detected';

    receiptItemsEl.innerHTML = '';

    let total = 0;
    let glutenCount = 0;
    let deductibleTotal = 0;

    data.items.forEach((item) => {
      const price = Number(item.price) || 0;
      total += price;
      if (item.containsGluten) glutenCount += 1;
      if (item.taxDeductibleGF) deductibleTotal += price;

      const li = document.createElement('li');
      li.className = 'receipt__item';

      const nameEl = document.createElement('span');
      nameEl.className = 'receipt__item-name';
      nameEl.textContent = item.name || 'Unnamed item';

      const priceEl = document.createElement('span');
      priceEl.className = 'receipt__item-price';
      priceEl.textContent = money(price);

      const tagEl = document.createElement('span');
      if (item.taxDeductibleGF) {
        tagEl.className = 'receipt__item-tag receipt__item-tag--deductible';
        tagEl.textContent = 'Tax-deductible GF';
      } else if (item.containsGluten) {
        tagEl.className = 'receipt__item-tag receipt__item-tag--gluten';
        tagEl.textContent = 'Contains gluten';
      } else {
        tagEl.className = 'receipt__item-tag receipt__item-tag--safe';
        tagEl.textContent = 'Gluten-free safe';
      }

      li.appendChild(nameEl);
      li.appendChild(priceEl);
      li.appendChild(tagEl);
      receiptItemsEl.appendChild(li);
    });

    summaryCountEl.textContent = String(data.items.length);
    summaryTotalEl.textContent = money(total);
    summaryGlutenEl.textContent = `${glutenCount} item${glutenCount === 1 ? '' : 's'}`;
    summaryDeductEl.textContent = money(deductibleTotal);

    lastShareText =
      `Breadwinner receipt summary\n` +
      `${data.storeName || 'Store'} — ${data.date || 'date unknown'}\n` +
      `Items scanned: ${data.items.length}\n` +
      `Receipt total: ${money(total)}\n` +
      `Contains gluten: ${glutenCount} item(s)\n` +
      `Tax-deductible gluten-free total: ${money(deductibleTotal)}`;
  }

})();