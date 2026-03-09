// popup.js — Dropship Tracker v3

// ─── FEES & FORMULA ──────────────────────────────────────────────────────────
const ALI_SHIPPING = 1.99;
const ALI_EXTRA    = 0.80;

function calcProfit(ebayPrice, aliItemPrice) {
  const yourCost  = aliItemPrice + ALI_SHIPPING + ALI_EXTRA;
  const fee_fixed = 0.35;
  const fee_15    = yourCost * 0.15;
  const fee_12    = ebayPrice * 0.12;
  const fee_low   = ebayPrice < 10 ? 1.99 : 0;
  const profit    = ebayPrice - yourCost - fee_fixed - fee_15 - fee_12 - fee_low;
  const profitPct = (profit / ebayPrice) * 100;
  return {
    profit:    +profit.toFixed(2),
    profitPct: +profitPct.toFixed(1),
    yourCost:  +yourCost.toFixed(2),
    fee_fixed,
    fee_15:    +fee_15.toFixed(2),
    fee_12:    +fee_12.toFixed(2),
    fee_low,
  };
}

function profitStatus(pct) {
  if (pct >= 20) return 'good';
  if (pct >= 5)  return 'low';
  return 'loss';
}

function suggestedPrice(totalCost) {
  const raw     = (totalCost + 0.35 + totalCost * 0.15) / (1 - 0.12 - 0.30);
  const rounded = Math.ceil(raw - 0.01) + 0.99;
  return rounded < raw ? rounded + 1 : rounded;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const container = () => $('content');

function daysAgo(iso) {
  if (!iso) return '?';
  const d = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  return `${d} days ago`;
}

function fmt(n) { return '$' + Math.abs(n).toFixed(2); }

// ─── VARIATION KEY HELPERS ────────────────────────────────────────────────────
// Pair key includes a "slot" derived from aliPrice so each variation saves separately.
// Format: ebayId_aliId_v{priceCents}[_varSlug]
// This means eBay listing 123 + Ali listing 456 + price $4.56 = 123_456_v456
// If two variations happen to have the same price but different labels, slug differentiates.
function makePairId(ebayId, aliId, aliPrice, varLabel) {
  const cents = Math.round(parseFloat(aliPrice) * 100);
  let id = `${ebayId}_${aliId}_v${cents}`;
  if (varLabel && varLabel.trim()) {
    const slug = varLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 20);
    id += `_${slug}`;
  }
  return id;
}

// ─── STATE ───────────────────────────────────────────────────────────────────
let session = { ebayPrice: null, ebayTitle: null, ebayUrl: null, ebayItemId: null };

function loadSession(cb) {
  chrome.storage.local.get(['session'], r => {
    if (r.session) session = { ...session, ...r.session };
    cb();
  });
}
function saveSession() { chrome.storage.local.set({ session }); }

function getProducts(cb) {
  chrome.storage.local.get(['products', 'pairs'], r => cb(r.products || {}, r.pairs || {}));
}
function saveProducts(products, pairs, cb) {
  chrome.storage.local.set({ products, pairs }, cb);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
function isAliUrl(url) { return /aliexpress\.(com|us)\/(item|i)\//.test(url); }
function isEbayUrl(url) { return /ebay\.com\/itm\//.test(url); }

loadSession(() => {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const url = tabs[0]?.url || '';
    if      (isEbayUrl(url)) renderEbayView(tabs[0].id);
    else if (isAliUrl(url))  renderAliView(tabs[0].id);
    else                     renderOtherView();
  });
});

$('resetBtn').addEventListener('click', () => {
  session = { ebayPrice: null, ebayTitle: null, ebayUrl: null, ebayItemId: null };
  saveSession();
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const url = tabs[0]?.url || '';
    if      (isEbayUrl(url)) renderEbayView(tabs[0].id);
    else if (isAliUrl(url))  renderAliView(tabs[0].id);
    else                     renderOtherView();
  });
});

$('exportBtn').addEventListener('click', exportCSV);

// ─── EBAY VIEW ────────────────────────────────────────────────────────────────
function renderEbayView(tabId) {
  chrome.tabs.sendMessage(tabId, { action: 'GET_EBAY_DATA' }, res => {
    const livePrice = res?.price  || null;
    const liveTitle = res?.title  || null;
    const liveUrl   = res?.url    || null;
    const liveId    = res?.itemId || null;

    const price = livePrice || null;
    const title = liveTitle || 'eBay Listing';
    const ebayDone = !!session.ebayPrice;

    let priceBlock = '';
    if (price) {
      priceBlock = `
        <div class="price-row">
          <span class="price-num">$${price.toFixed(2)}</span>
        </div>
        <div class="site-badge">🛒 <span>${title}</span></div>
        <div class="ai-note">💬 Found your eBay price. If this listing has <strong>variations</strong> (Single / Set of 3 / etc.), select the specific one you're sourcing on eBay before saving.</div>
      `;
    } else {
      priceBlock = `
        <div class="status-msg"><div class="pulse"></div>Reading the page…</div>
        <div class="ai-note">💬 Couldn't read the price automatically. Enter it manually below.</div>
      `;
    }

    container().innerHTML = `
      <div class="step ${ebayDone ? 'done' : 'active'}">
        <div class="step-header">
          <div class="step-num">${ebayDone ? '✓' : '1'}</div>
          <div class="step-label">eBay Price ${ebayDone ? '— Saved' : '— This Page'}</div>
        </div>
        ${ebayDone ? `
          <div class="price-num" style="font-size:22px;">$${session.ebayPrice.toFixed(2)}</div>
          <div class="site-badge">🛒 <span>${session.ebayTitle}</span></div>
          <div class="ai-note">💬 Got it! Now open the AliExpress source and I'll calculate your profit.</div>
          <button class="scan-btn outline" id="rescanBtn">↺ Re-scan this page</button>
        ` : `
          ${priceBlock}
          ${price ? `<button class="scan-btn" id="saveEbayBtn">💾 Save eBay Price & Go to Ali</button>` : `
            <div class="manual-hint">Can't read price? Enter manually:</div>
            <div class="manual-row">
              <input class="manual-input" id="manualEbay" type="number" step="0.01" min="0" placeholder="e.g. 12.99" />
              <button class="set-btn" id="setManualBtn">Save</button>
            </div>
          `}
        `}
      </div>
      ${ebayDone ? `<div class="next-hint">⬇️ Open the AliExpress source and click this extension there — I'll handle the rest.</div>` : ''}
    `;

    $('saveEbayBtn')?.addEventListener('click', () => {
      session.ebayPrice = price; session.ebayTitle = title;
      session.ebayUrl = liveUrl; session.ebayItemId = liveId;
      saveSession(); renderEbayView(tabId);
    });
    $('rescanBtn')?.addEventListener('click', () => {
      session.ebayPrice = livePrice; session.ebayTitle = liveTitle;
      session.ebayUrl = liveUrl; session.ebayItemId = liveId;
      saveSession(); renderEbayView(tabId);
    });
    $('setManualBtn')?.addEventListener('click', () => {
      const val = parseFloat($('manualEbay').value);
      if (!isNaN(val) && val > 0) {
        session.ebayPrice = val; session.ebayTitle = title || 'eBay Listing';
        session.ebayUrl = liveUrl; session.ebayItemId = liveId;
        saveSession(); renderEbayView(tabId);
      }
    });
  });
}

// ─── ALIEXPRESS VIEW ──────────────────────────────────────────────────────────
function renderAliView(tabId) {
  if (!session.ebayPrice) {
    container().innerHTML = `
      <div class="warning">
        <div class="w-icon">⚠️</div>
        <div>No eBay price saved yet.<br/>Go to your eBay listing first and click this extension there.</div>
      </div>
      <div class="manual-hint" style="margin-top:10px;">Or enter eBay price manually:</div>
      <div class="manual-row">
        <input class="manual-input" id="manualEbay2" type="number" step="0.01" min="0" placeholder="eBay price e.g. 12.99" />
        <button class="set-btn" id="setEbay2">Save</button>
      </div>
    `;
    $('setEbay2').addEventListener('click', () => {
      const val = parseFloat($('manualEbay2').value);
      if (!isNaN(val) && val > 0) {
        session.ebayPrice = val; session.ebayTitle = 'Manual';
        saveSession(); renderAliView(tabId);
      }
    });
    return;
  }

  chrome.tabs.sendMessage(tabId, { action: 'GET_ALI_DATA' }, res => {
    const livePrice = res?.price  || null;
    const liveTitle = res?.title  || null;
    const liveUrl   = res?.url    || null;
    const liveId    = res?.itemId || null;
    const aliTitle  = liveTitle || 'AliExpress Product';

    renderAliViewWithPrice(tabId, livePrice, liveTitle, liveUrl, liveId, aliTitle);
  });
}

// ─── ALI VIEW WITH PRICE ──────────────────────────────────────────────────────
function renderAliViewWithPrice(tabId, livePrice, liveTitle, liveUrl, liveId, aliTitle) {
  getProducts((products, pairs) => {
    const scannedPrice = livePrice || null;

    // ── Build result block ─────────────────────────────────────────────────
    function buildResult(aliPrice) {
      if (!aliPrice || !session.ebayPrice) return '';
      const r      = calcProfit(session.ebayPrice, aliPrice);
      const status = profitStatus(r.profitPct);
      const colors = { good: 'var(--green)', low: 'var(--amber)', loss: 'var(--red)' };
      const labels = { good: '🟢 GOOD', low: '🟡 LOW MARGIN', loss: '🔴 LOSING MONEY' };
      const color  = colors[status];
      const aiComments = {
        good: `💬 Solid listing! You're keeping ${r.profitPct}% as profit — that's healthy for dropshipping.`,
        low:  `💬 You're making money but the margin is thin. A small price rise from the supplier could push this into a loss.`,
        loss: `💬 You're losing money on every sale at these prices. Raise your eBay price or find a cheaper supplier.`
      };
      let suggHtml = '';
      if (status !== 'good') {
        const sugg = suggestedPrice(aliPrice + ALI_SHIPPING + ALI_EXTRA);
        suggHtml = `<div class="sugg-row" style="border-color:${color}30;background:${color}10;">
          <span style="color:${color};font-size:12px;font-weight:600;">${status === 'loss' ? '🚨' : '💡'} To hit 30% margin, price at:</span>
          <span style="color:${color};font-size:18px;font-weight:700;font-family:'Space Mono',monospace;">$${sugg.toFixed(2)}</span>
        </div>`;
      }
      return `
        <div class="divider">RESULT</div>
        <div class="result-card ${status}">
          <div class="result-status" style="color:${color};">${labels[status]}</div>
          <div class="result-profit" style="color:${color};">
            ${r.profit >= 0 ? '+' : '−'}$${Math.abs(r.profit).toFixed(2)}
            <span class="result-pct">(${r.profitPct >= 0 ? '+' : ''}${r.profitPct}%)</span>
          </div>
          <div class="ai-note" style="margin:6px 0 10px;">${aiComments[status]}</div>
          <div class="breakdown">
            <div class="br-row"><span>eBay Sale Price</span><span class="br-val">$${session.ebayPrice.toFixed(2)}</span></div>
            <div class="br-sep"></div>
            <div class="br-row"><span>Ali Item Price</span><span class="br-val neg">−$${aliPrice.toFixed(2)}</span></div>
            <div class="br-row"><span>Ali Shipping</span><span class="br-val neg">−$${ALI_SHIPPING.toFixed(2)}</span></div>
            <div class="br-row"><span>Ali Extra</span><span class="br-val neg">−$${ALI_EXTRA.toFixed(2)}</span></div>
            <div class="br-sep"></div>
            <div class="br-row"><span>Fixed eBay Fee</span><span class="br-val neg">−$${r.fee_fixed.toFixed(2)}</span></div>
            <div class="br-row"><span>15% of Your Cost</span><span class="br-val neg">−$${r.fee_15.toFixed(2)}</span></div>
            <div class="br-row"><span>12% eBay Final Value</span><span class="br-val neg">−$${r.fee_12.toFixed(2)}</span></div>
            ${r.fee_low > 0 ? `<div class="br-row"><span>Low Value Fee (&lt;$10)</span><span class="br-val neg">−$${r.fee_low.toFixed(2)}</span></div>` : ''}
            <div class="br-total"><span>Net Profit</span><span style="color:${color};font-family:'Space Mono',monospace;">${r.profit >= 0 ? '+' : '−'}$${Math.abs(r.profit).toFixed(2)}</span></div>
          </div>
        </div>${suggHtml}`;
    }

    function render(currentAliPrice, currentVarLabel) {
      // Auto-detect variation label from page title if not provided
      const autoLabel = currentVarLabel !== undefined ? currentVarLabel : (liveTitle ? '' : '');

      container().innerHTML = `
        <div class="step done" style="padding:10px 14px;margin-bottom:10px;">
          <div class="step-header"><div class="step-num">✓</div><div class="step-label">eBay — Saved</div></div>
          <div class="price-num" style="font-size:18px;">$${session.ebayPrice?.toFixed(2) || '—'}</div>
          <div class="site-badge">🛒 <span>${session.ebayTitle || 'eBay Listing'}</span></div>
        </div>
        <div class="step active">
          <div class="step-header">
            <div class="step-num">2</div>
            <div class="step-label">AliExpress — ${currentAliPrice ? 'Scanned ✓' : 'Enter Price'}</div>
          </div>
          ${currentAliPrice ? `
            <div class="price-row">
              <span class="price-num" style="color:var(--green);">$${currentAliPrice.toFixed(2)}</span>
            </div>
            <div class="site-badge">📦 <span>${aliTitle}</span></div>
            <div class="cost-note">+ $${ALI_SHIPPING.toFixed(2)} shipping + $${ALI_EXTRA.toFixed(2)} extra = <strong>Your Cost: $${(currentAliPrice + ALI_SHIPPING + ALI_EXTRA).toFixed(2)}</strong></div>
          ` : `
            <div class="status-msg"><div class="pulse" style="background:var(--green);"></div>Couldn't read price — enter manually</div>
          `}

          <div class="variation-row" style="margin-top:9px;">
            <span class="variation-label">💬 Variation label <span style="opacity:0.6;">(e.g. "30-40g 1Pc")</span></span>
            <div class="manual-row" style="margin-top:4px;">
              <input class="manual-input" id="varLabelInput" type="text" placeholder="e.g. 30-40g 1Pc"
                value="${autoLabel || ''}" style="font-family:'DM Sans',sans-serif;font-size:12px;" />
            </div>
          </div>

          <div class="variation-row" style="margin-top:6px;">
            <span class="variation-label">💬 ${currentAliPrice ? 'Override price for this variation:' : 'Ali item price:'}</span>
            <div class="manual-row" style="margin-top:4px;">
              <input class="manual-input" id="aliPriceInput" type="number" step="0.01" min="0"
                placeholder="${currentAliPrice ? currentAliPrice.toFixed(2) : 'e.g. 4.71'}"
                value="${currentAliPrice ? currentAliPrice.toFixed(2) : ''}" />
              <button class="set-btn" id="recalcBtn">Recalc</button>
            </div>
          </div>
        </div>
        ${buildResult(currentAliPrice)}
        ${currentAliPrice ? `<button class="scan-btn" id="savePairBtn">💾 Save This Pair</button>` : ''}
      `;

      $('recalcBtn')?.addEventListener('click', () => {
        const val = parseFloat($('aliPriceInput').value);
        const lbl = $('varLabelInput')?.value || '';
        if (!isNaN(val) && val > 0) render(val, lbl);
      });

      $('aliPriceInput')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          const val = parseFloat($('aliPriceInput').value);
          const lbl = $('varLabelInput')?.value || '';
          if (!isNaN(val) && val > 0) render(val, lbl);
        }
      });

      $('savePairBtn')?.addEventListener('click', () => {
        const finalAliPrice = parseFloat($('aliPriceInput').value) || currentAliPrice;
        const varLabel      = $('varLabelInput')?.value?.trim() || '';
        if (!finalAliPrice) { showToast('⚠️ No Ali price to save'); return; }

        const now    = new Date().toISOString();
        const aliId  = liveId || (liveUrl?.match(/\/(item|i)\/(\d+)/)?.[2]) || ('manual_' + Date.now());
        const ebayId = session.ebayItemId || ('manual_' + Date.now());

        // ── VARIATION-AWARE PAIR KEY ────────────────────────────────────────
        // Each unique (ebayId + aliId + price + label) gets its own row in CSV.
        // This is the core fix: no more overwriting between variations.
        const pairId  = makePairId(ebayId, aliId, finalAliPrice, varLabel);
        const ebayKey = `ebay_${ebayId}`;
        const aliKey  = `ali_${aliId}_v${Math.round(finalAliPrice * 100)}`;

        getProducts((products, pairs) => {
          // Upsert eBay product
          if (!products[ebayKey]) {
            products[ebayKey] = {
              type: 'ebay', itemId: ebayId, url: session.ebayUrl || '',
              title: session.ebayTitle || 'eBay', currentPrice: session.ebayPrice,
              previousPrice: null, firstSeenDate: now, lastSeenDate: now,
              history: [{ price: session.ebayPrice, date: now }]
            };
          } else {
            products[ebayKey].currentPrice = session.ebayPrice;
            products[ebayKey].title = session.ebayTitle || products[ebayKey].title;
            products[ebayKey].lastSeenDate = now;
          }

          // Upsert Ali product — keyed by itemId+price so each variation is separate
          if (!products[aliKey]) {
            products[aliKey] = {
              type: 'ali', itemId: aliId, url: liveUrl || '', title: aliTitle,
              currentPrice: finalAliPrice, previousPrice: null,
              variationLabel: varLabel,
              firstSeenDate: now, lastSeenDate: now,
              history: [{ price: finalAliPrice, date: now }]
            };
          } else {
            // Same variation seen again — update if price shifted
            if (products[aliKey].currentPrice !== finalAliPrice) {
              products[aliKey].previousPrice = products[aliKey].currentPrice;
              products[aliKey].currentPrice  = finalAliPrice;
              products[aliKey].history = products[aliKey].history || [];
              products[aliKey].history.push({ price: finalAliPrice, date: now });
              if (products[aliKey].history.length > 10) products[aliKey].history.shift();
            }
            products[aliKey].lastSeenDate = now;
            if (varLabel) products[aliKey].variationLabel = varLabel;
          }

          // pairs[pairId] = unique per variation
          pairs[pairId] = { ebayKey, aliKey, variationLabel: varLabel };

          saveProducts(products, pairs, () => {
            updateStoredCSV(products, pairs);
            showToast('✅ Pair saved!');
            session = { ebayPrice: null, ebayTitle: null, ebayUrl: null, ebayItemId: null };
            saveSession();
            const btn = $('savePairBtn');
            if (btn) { btn.textContent = '✅ Saved!'; btn.disabled = true; btn.style.background = 'var(--green)'; }
          });
        });
      });
    }

    render(scannedPrice, '');
  });
}

// ─── OTHER PAGE VIEW ─────────────────────────────────────────────────────────
function renderOtherView() {
  getProducts((products, pairs) => {
    const pairCount = Object.keys(pairs).length;
    let alerts = 0;
    for (const { aliKey } of Object.values(pairs)) {
      const ap = products[aliKey];
      if (ap?.previousPrice && ap.currentPrice > ap.previousPrice) alerts++;
    }

    container().innerHTML = `
      <div class="info-box">
        <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px;">Navigate to a listing to get started</div>
        <div style="font-size:12px;color:var(--muted);">Open an <strong style="color:var(--text);">eBay listing</strong> or <strong style="color:var(--text);">AliExpress product</strong> and click this extension.</div>
      </div>

      ${session.ebayPrice ? `
        <div class="step done" style="padding:10px 14px;">
          <div class="step-header"><div class="step-num">✓</div><div class="step-label">eBay Saved</div></div>
          <div class="price-num" style="font-size:18px;">$${session.ebayPrice.toFixed(2)}</div>
          <div class="site-badge">🛒 <span>${session.ebayTitle}</span></div>
        </div>
      ` : ''}

      <div class="stats-row">
        <div class="stat"><span class="stat-n">${pairCount}</span><span class="stat-l">Pairs Saved</span></div>
        <div class="stat"><span class="stat-n" style="color:${alerts > 0 ? 'var(--red)' : 'var(--green)'};">${alerts}</span><span class="stat-l">Price Alerts</span></div>
      </div>
    `;
  });
}

// ─── PERSISTENT CSV ───────────────────────────────────────────────────────────
function buildCSVRows(products, pairs) {
  const headers = [
    'pair_id','variation_label','name',
    'ebay_url','ebay_price',
    'ali_url','ali_price',
    'total_cost','profit','profit_pct','status',
    'first_saved','ali_last_seen','ali_price_change'
  ];
  const rows = [headers.join(',')];

  for (const [pairId, { ebayKey, aliKey, variationLabel }] of Object.entries(pairs)) {
    const ep = products[ebayKey];
    const ap = products[aliKey];
    if (!ep) continue;

    const ebayPrice = parseFloat(ep.currentPrice);
    const aliPrice  = ap ? parseFloat(ap.currentPrice) : NaN;
    const varLabel  = variationLabel || ap?.variationLabel || '';
    let profit = '', profitPct = '', status = '', totalCost = '', aliChange = '';

    if (ap && !isNaN(ebayPrice) && !isNaN(aliPrice)) {
      const r = calcProfit(ebayPrice, aliPrice);
      profit    = r.profit.toFixed(2);
      profitPct = r.profitPct.toFixed(1);
      status    = profitStatus(r.profitPct);
      totalCost = r.yourCost.toFixed(2);
      const prev = parseFloat(ap.previousPrice);
      if (!isNaN(prev) && prev !== aliPrice) {
        const d = aliPrice - prev;
        aliChange = (d > 0 ? '+' : '') + d.toFixed(2);
      }
    }

    rows.push([
      pairId,
      `"${varLabel.replace(/"/g, '""')}"`,
      `"${(ep.title || '').replace(/"/g, '""')}"`,
      ep.url || '',
      !isNaN(ebayPrice) ? ebayPrice.toFixed(2) : '',
      ap ? (ap.url || '') : '',
      !isNaN(aliPrice)  ? aliPrice.toFixed(2)  : '',
      totalCost, profit, profitPct, status,
      ep.firstSeenDate ? ep.firstSeenDate.split('T')[0] : '',
      ap?.lastSeenDate  ? ap.lastSeenDate.split('T')[0]  : '',
      aliChange
    ].join(','));
  }

  return rows.join('\r\n');
}

function updateStoredCSV(products, pairs) {
  const csv = '\uFEFF' + buildCSVRows(products, pairs);
  chrome.storage.local.set({ persistentCSV: csv });
}

// ─── EXPORT CSV ──────────────────────────────────────────────────────────────
function exportCSV() {
  getProducts((products, pairs) => {
    if (!Object.keys(pairs).length) { showToast('💬 No pairs saved yet'); return; }

    const csv     = '\uFEFF' + buildCSVRows(products, pairs);
    const blob    = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const blobUrl = URL.createObjectURL(blob);
    const count   = Object.keys(pairs).length;

    chrome.downloads.search({ filenameRegex: 'dropship_products\\.csv', limit: 10 }, results => {
      const existing = results.filter(r => !r.filename.match(/\(\d+\)/));
      const deleteOld = (items, cb) => {
        if (!items.length) { cb(); return; }
        chrome.downloads.removeFile(items[0].id, () => {
          chrome.downloads.erase({ id: items[0].id }, () => deleteOld(items.slice(1), cb));
        });
      };
      deleteOld(existing, () => {
        chrome.downloads.download({
          url: blobUrl,
          filename: 'dropship_products.csv',
          conflictAction: 'overwrite',
          saveAs: false
        }, () => {
          URL.revokeObjectURL(blobUrl);
          showToast(`✅ ${count} pairs → dropship_products.csv`);
        });
      });
    });
  });
}

// ─── TOAST ───────────────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2500);
}