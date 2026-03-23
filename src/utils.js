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
    if (typeof pageCode !== 'undefined' && pageCode) return pageCode;
    const match = window.location.search.match(/page=([a-f0-9]+)/);
    if (match) return match[1];
    // Fallback: scan <script> tags for pageCode = 'xxx' (KOS injects it server-side)
    for (const s of document.querySelectorAll('script')) {
      const m = s.textContent.match(/pageCode\s*=\s*'([a-f0-9]+)'/);
      if (m) return m[1];
    }
    return null;
  },

  navigate(endpoint) {
    const pc = this.getPageCode();
    if (pc) {
      const sep = endpoint.includes('?') ? '&' : '?';
      window.open(endpoint + sep + 'page=' + pc, '_self');
    } else {
      // No page code — redirect to KOS home to get a fresh session
      window.open(this.BASE, '_self');
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
    // týdny:1,2,3,... — semester teaching week numbers
    // AMU semester typically starts in mid-February (LS) or mid-September (ZS)
    if (parity.startsWith('týdny:')) {
      const weeks = parity.replace('týdny:', '').split(',').map(Number).filter(n => !isNaN(n));
      if (weeks.length === 0) return true;
      const teachingWeek = this.getTeachingWeek();
      if (teachingWeek === null) return true; // can't determine, show as active
      return weeks.includes(teachingWeek);
    }
    return true;
  },

  /** Estimate current teaching week number (1-14) based on AMU semester dates */
  getTeachingWeek() {
    const now = new Date();
    const month = now.getMonth() + 1;
    let semStart;
    if (month >= 9 || month <= 1) {
      // Winter semester (ZS): typically starts around Sept 22
      const year = month >= 9 ? now.getFullYear() : now.getFullYear() - 1;
      semStart = new Date(year, 8, 22); // Sept 22
    } else {
      // Summer semester (LS): typically starts around Feb 17
      semStart = new Date(now.getFullYear(), 1, 17); // Feb 17
    }
    const diffDays = Math.floor((now - semStart) / 86400000);
    if (diffDays < 0) return null;
    const week = Math.floor(diffDays / 7) + 1;
    return week >= 1 && week <= 20 ? week : null;
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

  /** Check if the extension context is still valid */
  isContextValid() {
    try {
      return !!(chrome && chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  },

  cache(key, data) {
    if (!this.isContextValid()) return;
    try {
      chrome.storage.local.set({ [key]: { data, ts: Date.now() } });
    } catch (e) { /* extension reloaded */ }
  },

  getCache(key) {
    return new Promise(resolve => {
      if (!this.isContextValid()) { resolve(null); return; }
      try {
        chrome.storage.local.get(key, result => {
          try {
            if (chrome.runtime.lastError) { resolve(null); return; }
            resolve(result[key] || null);
          } catch (e) { resolve(null); }
        });
      } catch (e) {
        resolve(null);
      }
    });
  },

  clearCache() {
    return new Promise(resolve => {
      if (!this.isContextValid()) { resolve(); return; }
      try {
        chrome.storage.local.remove(['schedule', 'subjects', 'modules'], resolve);
      } catch (e) {
        resolve();
      }
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
      if (!this.isContextValid()) { resolve(new Set()); return; }
      try {
        chrome.storage.local.get(['hidden_schedule_entries', 'hidden_schedule_codes'], result => {
          if (chrome.runtime.lastError) { resolve(new Set()); return; }
          let entries = result.hidden_schedule_entries || [];
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
      } catch (e) {
        resolve(new Set());
      }
    });
  },

  hideScheduleEntry(code, day) {
    const key = `${code}@${day}`;
    return new Promise(resolve => {
      if (!this.isContextValid()) { resolve(); return; }
      try {
        chrome.storage.local.get('hidden_schedule_entries', result => {
          const entries = result.hidden_schedule_entries || [];
          if (!entries.includes(key)) entries.push(key);
          chrome.storage.local.set({ hidden_schedule_entries: entries }, resolve);
        });
      } catch (e) { resolve(); }
    });
  },

  unhideScheduleEntry(code, day) {
    const key = `${code}@${day}`;
    return new Promise(resolve => {
      if (!this.isContextValid()) { resolve(); return; }
      try {
        chrome.storage.local.get('hidden_schedule_entries', result => {
          const entries = (result.hidden_schedule_entries || []).filter(e => e !== key);
          chrome.storage.local.set({ hidden_schedule_entries: entries }, resolve);
        });
      } catch (e) { resolve(); }
    });
  },

  DAYS: ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'],
  MONTHS: ['ledna', 'února', 'března', 'dubna', 'května', 'června',
           'července', 'srpna', 'září', 'října', 'listopadu', 'prosince']
};
