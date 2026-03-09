// content_ali.js — price extraction based on proven frequency method

function extractPrice() {
    // Method 1: meta tag (most reliable when present)
    const meta = document.querySelector('meta[itemprop="price"]');
    if (meta) {
      const p = parseFloat(meta.getAttribute('content'));
      if (p > 0) return p;
    }
  
    // Method 2: leaf elements with exact price pattern + price class
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      if (el.children.length > 0) continue;
      const text = el.textContent.trim();
      const match = text.match(/^\$?([\d]+\.[\d]{2})$/);
      if (match) {
        const p = parseFloat(match[1]);
        if (p > 0.5 && p < 10000) {
          const cls = (el.className || '') + (el.closest('[class]')?.className || '');
          if (cls.toLowerCase().includes('price') || el.tagName === 'STRONG') return p;
        }
      }
    }
  
    // Method 3: frequency analysis — most repeated $ price on the page wins
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const prices = [];
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent;
      const matches = [...text.matchAll(/\$\s*([\d,]+\.?\d*)/g)];
      for (const m of matches) {
        const p = parseFloat(m[1].replace(',', ''));
        if (p > 0.5 && p < 10000) prices.push(p);
      }
    }
    if (prices.length > 0) {
      const freq = {};
      prices.forEach(p => freq[p] = (freq[p] || 0) + 1);
      return parseFloat(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]);
    }
  
    return null;
  }
  
  function getTitle() {
    // Try specific product title selectors first
    const selectors = [
      'h1[class*="title"]',
      '[class*="product-title"]',
      '[class*="title--wrap"] h1',
      '[class*="title--"] h1',
      'h1'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      const text = el?.textContent?.trim();
      if (text && text.length > 5 && !text.toLowerCase().includes('aliexpress')) {
        return text.slice(0, 80);
      }
    }
    // Fall back to page title, strip site name
    return document.title.replace(/[-|]?\s*AliExpress\s*/gi, '').trim().slice(0, 80) || 'AliExpress Product';
  }
  
  function normalizeUrl(url) {
    const m = url.match(/\/(item|i)\/(\d+)/);
    return m ? `https://www.aliexpress.com/item/${m[2]}.html` : url.split('?')[0];
  }
  
  function getItemId(url) {
    const m = url.match(/\/(item|i)\/(\d+)/);
    return m ? m[2] : null;
  }
  
  // Auto-save on page load with retries for dynamic content
  function autoSave() {
    const price  = extractPrice();
    const title  = getTitle();
    const url    = normalizeUrl(window.location.href);
    const itemId = getItemId(window.location.href);
    if (!itemId) return;
  
    const now = new Date().toISOString();
    const key = 'ali_' + itemId;
  
    chrome.storage.local.get(['products'], (data) => {
      const products = data.products || {};
      const existing = products[key];
      if (!existing) {
        products[key] = { type:'ali', itemId, url, title,
          currentPrice: price, previousPrice: null,
          firstSeenDate: now, lastSeenDate: now,
          history: price ? [{price, date: now}] : [] };
      } else if (price && price !== existing.currentPrice) {
        existing.previousPrice = existing.currentPrice;
        existing.currentPrice  = price;
        existing.lastSeenDate  = now;
        if (title) existing.title = title;
        existing.history = existing.history || [];
        existing.history.push({ price, date: now });
        if (existing.history.length > 10) existing.history.shift();
        products[key] = existing;
      } else {
        existing.lastSeenDate = now;
        products[key] = existing;
      }
      chrome.storage.local.set({ products });
    });
  }
  
  function tryAutoSave(retries) {
    const price = extractPrice();
    if (!price && retries > 0) { setTimeout(() => tryAutoSave(retries - 1), 1200); return; }
    autoSave();
  }
  setTimeout(() => tryAutoSave(4), 600);
  
  // Respond to popup
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'GET_ALI_DATA') {
      const price = extractPrice();
      sendResponse({
        price,
        title:      getTitle(),
        url:        normalizeUrl(window.location.href),
        itemId:     getItemId(window.location.href),
        priceFound: price !== null
      });
    }
    return true;
  });