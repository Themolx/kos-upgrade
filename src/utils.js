/**
 * KOS Upgrade – shared utilities
 *
 * KOS requires ?page= for ALL authenticated requests.
 * Using page= in fetch/iframe invalidates the parent session.
 * → We cache data when user visits each page, show on homepage.
 */

// Browser API compatibility (Chrome uses chrome.*, Safari uses browser.*)
if (typeof chrome === 'undefined' && typeof browser !== 'undefined') {
  var chrome = browser;
}

const KOS = {
  BASE: 'https://kos.amu.cz',

  getPageCode() {
    if (typeof pageCode !== 'undefined') return pageCode;
    const match = window.location.search.match(/page=([a-f0-9]+)/);
    return match ? match[1] : null;
  },

  navigate(endpoint) {
    const pc = this.getPageCode();
    if (pc) {
      const sep = endpoint.includes('?') ? '&' : '?';
      window.open(endpoint + sep + 'page=' + pc, '_self');
    }
  },

  getISOWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  },

  isOddWeek(date = new Date()) {
    return this.getISOWeek(date) % 2 === 1;
  },

  /** Check if a schedule entry is active this week based on its parity field */
  isEntryActive(parity, isOdd) {
    if (!parity || parity === 'každý') return true;
    if (parity === 'lichý') return isOdd;
    if (parity === 'sudý') return !isOdd;
    // týdny:1,2,3,... — semester-week-specific; show as active (can't determine semester week)
    if (parity.startsWith('týdny:')) return true;
    return true;
  },

  el(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'className') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else el.setAttribute(k, v);
    }
    for (const child of children) {
      if (typeof child === 'string') el.appendChild(document.createTextNode(child));
      else if (child) el.appendChild(child);
    }
    return el;
  },

  parseCzDate(str) {
    const match = str.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (!match) return null;
    return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
  },

  // ── Cache ──

  cache(key, data) {
    chrome.storage.local.set({ [key]: { data, ts: Date.now() } });
  },

  getCache(key) {
    return new Promise(resolve => {
      chrome.storage.local.get(key, result => {
        resolve(result[key] || null);
      });
    });
  },

  clearCache() {
    return new Promise(resolve => {
      chrome.storage.local.remove(['schedule', 'subjects', 'modules'], resolve);
    });
  },

  timeAgo(ts) {
    const mins = Math.floor((Date.now() - ts) / 60000);
    if (mins < 1) return 'právě teď';
    if (mins < 60) return `před ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `před ${hours} hod`;
    return `před ${Math.floor(hours / 24)} dny`;
  },

  // ── Hidden schedule entries (per day+code) ──

  getHiddenScheduleEntries() {
    return new Promise(resolve => {
      chrome.storage.local.get(['hidden_schedule_entries', 'hidden_schedule_codes'], result => {
        let entries = result.hidden_schedule_entries || [];
        // Migrate old code-based format → entry-based (all 5 days)
        if (result.hidden_schedule_codes && result.hidden_schedule_codes.length > 0) {
          for (const code of result.hidden_schedule_codes) {
            for (let d = 0; d < 5; d++) {
              const key = `${code}@${d}`;
              if (!entries.includes(key)) entries.push(key);
            }
          }
          chrome.storage.local.set({ hidden_schedule_entries: entries });
          chrome.storage.local.remove('hidden_schedule_codes');
        }
        resolve(new Set(entries));
      });
    });
  },

  hideScheduleEntry(code, day) {
    const key = `${code}@${day}`;
    return new Promise(resolve => {
      chrome.storage.local.get('hidden_schedule_entries', result => {
        const entries = result.hidden_schedule_entries || [];
        if (!entries.includes(key)) entries.push(key);
        chrome.storage.local.set({ hidden_schedule_entries: entries }, resolve);
      });
    });
  },

  unhideScheduleEntry(code, day) {
    const key = `${code}@${day}`;
    return new Promise(resolve => {
      chrome.storage.local.get('hidden_schedule_entries', result => {
        const entries = (result.hidden_schedule_entries || []).filter(e => e !== key);
        chrome.storage.local.set({ hidden_schedule_entries: entries }, resolve);
      });
    });
  },

  DAYS: ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'],
  MONTHS: ['ledna', 'února', 'března', 'dubna', 'května', 'června',
           'července', 'srpna', 'září', 'října', 'listopadu', 'prosince']
};
