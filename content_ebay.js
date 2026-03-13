// content_ebay.js — auto-runs on every eBay listing page

function getEbayPrice() {
    const selectors = [
      '[itemprop="price"]',
      '.x-price-primary .ux-textspans',
      '.x-price-primary span[itemprop="price"]',
      '#prcIsum',
      '#mm-saleDscPrc',
      '.vi-price .notranslate',
      '[data-testid="x-price-section"] .ux-textspans--BOLD',
      '.x-price-approx__price .ux-textspans'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const raw = el.getAttribute('content') || el.innerText || '';
        // Strip any currency symbol/code: $, €, £, AU$, CA$, CHF, PLN, etc.
        const cleaned = raw.replace(/[^0-9.,]/g, '').replace(',', '.');
        // Handle European decimal format: "1.234,56" → "1234.56"
        const normalized = cleaned.match(/\d{1,3}(?:\.\d{3})+,\d{2}$/)
          ? cleaned.replace(/\./g, '').replace(',', '.')
          : cleaned.replace(/,(?=\d{2}$)/, '.');
        const num = parseFloat(normalized);
        if (!isNaN(num) && num > 0) return num;
      }
    }
    // fallback: JSON in scripts
    try {
      for (const s of document.querySelectorAll('script')) {
        const t = s.textContent || '';
        const m = t.match(/"finalPrice"\s*:\s*"?([\d.]+)"?/) || t.match(/"binPrice"\s*:\s*"?([\d.]+)"?/);
        if (m) return parseFloat(m[1]);
      }
    } catch(e) {}
    return null;
  }
  
  function getEbayTitle() {
    const el = document.querySelector('h1.x-item-title__mainTitle span, h1[itemprop="name"], #itemTitle');
    if (el) return el.innerText.replace('Details about', '').trim().substring(0, 80);
    return document.title.replace(/\s*\|\s*eBay\s*$/i, '').trim().substring(0, 80);
  }
  
  function normalizeUrl(url) {
    const m = url.match(/\/itm\/(\d+)/);
    if (m) {
      // Preserve the original domain (ebay.de, ebay.co.uk, etc.)
      const domain = url.match(/https?:\/\/(www\.ebay\.[a-z.]+)/)?.[1] || 'www.ebay.com';
      return `https://${domain}/itm/${m[1]}`;
    }
    return url.split('?')[0];
  }
  
  // ── Auto-save price on every page load ──────────────────────────────────────
  function autoSave() {
    const price = getEbayPrice();
    const title = getEbayTitle();
    const url   = normalizeUrl(window.location.href);
    const itemId = (url.match(/\/itm\/(\d+)/) || [])[1];
    if (!itemId) return;
  
    const now = new Date().toISOString();
    const key = `ebay_${itemId}`;
  
    chrome.storage.local.get(['products'], (data) => {
      const products = data.products || {};
      const existing = products[key];
  
      if (!existing) {
        // First time seeing this product
        products[key] = {
          type: 'ebay', itemId, url, title,
          currentPrice: price,
          previousPrice: null,
          firstSeenDate: now,
          lastSeenDate: now,
          history: price ? [{ price, date: now }] : []
        };
      } else {
        // Already seen — update price if changed
        if (price && price !== existing.currentPrice) {
          existing.previousPrice = existing.currentPrice;
          existing.currentPrice  = price;
          existing.history = existing.history || [];
          existing.history.push({ price, date: now });
          if (existing.history.length > 10) existing.history.shift();
        }
        existing.lastSeenDate = now;
        if (title) existing.title = title;
        products[key] = existing;
      }
  
      chrome.storage.local.set({ products });
    });
  }
  
  autoSave();
  
  // ── Respond to popup ─────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'GET_EBAY_DATA') {
      sendResponse({
        price: getEbayPrice(),
        title: getEbayTitle(),
        url:   normalizeUrl(window.location.href),
        itemId: (window.location.href.match(/\/itm\/(\d+)/) || [])[1] || null
      });
    }
    return true;
  });
