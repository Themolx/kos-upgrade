/**
 * KOS Upgrade – Schedule page
 * Enhances rozvrh in-place + caches data for homepage.
 */

const Schedule = {
  init() {
    if (!window.location.href.includes('studentMinutesSchedule.do')) return;
    this.waitForSchedule(() => {
      this.enhance();
      this.cacheData();
      // If refreshing, chain: schedule -> modules -> home
      if (window.location.search.includes('refreshChain=2')) {
        setTimeout(() => KOS.navigate('moduls.do?refreshChain=3'), 800);
      }
    });
  },

  waitForSchedule(callback, n = 0) {
    const r = document.getElementById('rozvrh');
    if (r && r.children.length > 5) { callback(); return; }
    if (n < 30) setTimeout(() => this.waitForSchedule(callback, n + 1), 300);
  },

  enhance() {
    const isOdd = KOS.isOddWeek();
    document.querySelectorAll('div[id^="detaillistek"]').forEach(detail => {
      const id = detail.id.replace('detaillistek', '');
      const rozvrh = document.getElementById('rozvrh');
      if (!rozvrh) return;
      // Only select direct listek divs inside rozvrh, not detaillistek
      rozvrh.querySelectorAll(`div[id="listek${id}"]`).forEach(listek => {
        if (listek.querySelector('.kos-parity')) return;
        const m = detail.textContent.match(/Týden výuky:\s*(lichý|sudý|každý)/i);
        if (!m || m[1].toLowerCase() === 'každý') return;
        const parityType = m[1].toLowerCase();
        const isActive = (parityType === 'lichý') === isOdd;
        const shortLabel = parityType === 'lichý' ? 'L' : 'S';
        const fullLabel = isActive ? `${m[1]} — tento týden` : `${m[1]} — příští týden`;
        listek.appendChild(KOS.el('div', {
          className: `kos-parity kos-parity--${isActive ? 'active' : 'inactive'}`,
          title: fullLabel
        }, shortLabel));
        if (!isActive) listek.classList.add('kos-dimmed');
      });
    });

    const day = new Date().getDay();
    if (day >= 1 && day <= 5) {
      const dny = document.getElementById('dny');
      if (dny && dny.children[day - 1]) dny.children[day - 1].classList.add('kos-today-day');
      const rozvrh = document.getElementById('rozvrh');
      if (rozvrh) {
        rozvrh.insertBefore(KOS.el('div', { style: {
          position: 'absolute', top: ((day - 1) * 120) + 'px',
          left: '0', width: '100%', height: '120px',
          background: 'rgba(1, 116, 123, 0.04)', pointerEvents: 'none', zIndex: '0'
        }}), rozvrh.firstChild);
      }
    }
  },

  /** Cache all schedule entries for homepage use */
  cacheData() {
    const entries = [];
    const seen = new Set();
    const rozvrh = document.getElementById('rozvrh');
    if (!rozvrh) return;

    // IMPORTANT: Only search within the FIRST rozvrh div.
    // KOS pages have TWO rozvrh divs — the first is enrolled, the second is alternatives.
    rozvrh.querySelectorAll('div[id^="detaillistek"]').forEach(detail => {
      const id = detail.id.replace('detaillistek', '');
      const text = detail.textContent;

      const code = (text.match(/Kód\s+předmětu\s*:\s*(\S+)/i) || [])[1] || '';
      const name = (text.match(/Název\s+předmětu\s*:\s*(.+?)(?:\s{2,}|\n|Týden|Kód|Čas|Místnost)/i) || [])[1]?.trim() || '';
      const parity = (text.match(/Týden\s+výuky\s*:\s*(lichý|sudý|každý)/i) || [])[1]?.toLowerCase() || 'každý';
      const time = (text.match(/Čas\s+výuky\s*:\s*(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})/i) || [])[1] || '';
      const room = (text.match(/Místnost\s*:\s*(\S+)/i) || [])[1] || '';

      if (!code && !time) {
        console.warn('[KOS Upgrade] Failed to parse schedule entry:', id, text.substring(0, 200));
        return;
      }

      // Find all listek divs for this entry inside rozvrh only
      // Skip elements hidden via display:none or not actually visible
      rozvrh.querySelectorAll(`div[id="listek${id}"]`).forEach(listek => {
        // Check if element is actually visible on the page
        if (listek.style.display === 'none') return;
        if (listek.offsetWidth === 0 && listek.offsetHeight === 0) return;
        const computed = window.getComputedStyle(listek);
        if (computed.display === 'none' || computed.visibility === 'hidden') return;

        const top = parseInt(listek.style.top);
        if (isNaN(top)) return;
        const dayIdx = Math.floor(top / 120);
        if (dayIdx < 0 || dayIdx > 4) return;

        const key = `${dayIdx}-${code}-${time}-${parity}`;
        if (seen.has(key)) return;
        seen.add(key);

        entries.push({ day: dayIdx, code, name, time, room, parity });
      });
    });

    // Also parse collision divs (divik) inside the first rozvrh
    // These contain subjects in time-slot collisions that don't have their own listek
    const DAY_NAMES = { 'pondělí': 0, 'ponděli': 0, 'úterý': 1, 'uterý': 1, 'utery': 1, 'středa': 2, 'streda': 2, 'čtvrtek': 3, 'ctvrtek': 3, 'pátek': 4, 'patek': 4 };
    rozvrh.querySelectorAll('div[id^="detaildivik"]').forEach(detail => {
      // Get day from the parent divik's top position
      const divikId = detail.id.replace('detaildivik', '');
      const divik = rozvrh.querySelector(`div[id="divik${divikId}"]`);
      let dayIdx = -1;
      if (divik) {
        const top = parseInt(divik.style.top);
        if (!isNaN(top)) dayIdx = Math.floor(top / 120);
      }
      // Fallback: parse day from the collision header text ("Kolize N: (Pondělí - ...)")
      if (dayIdx < 0 || dayIdx > 4) {
        const headerText = detail.textContent;
        const dayMatch = headerText.match(/Kolize\s+\d+\s*:\s*\((\S+)/i);
        if (dayMatch) {
          const dn = dayMatch[1].toLowerCase().replace(/[^a-záéíóúůýčďěňřšťž]/g, '');
          if (DAY_NAMES[dn] !== undefined) dayIdx = DAY_NAMES[dn];
        }
      }
      if (dayIdx < 0 || dayIdx > 4) return;

      // Parse poznámka for deferred start dates (e.g. "začne 30.3.2026")
      const detailText = detail.textContent;

      // Parse each subject row in the collision table
      detail.querySelectorAll('tr').forEach(row => {
        const cells = row.querySelectorAll('td.ttSubjectRow1');
        if (cells.length < 5) return;
        const code = cells[0].textContent.trim();
        const name = cells[1].textContent.trim();
        const room = cells[2].textContent.trim();
        const time = cells[4].textContent.trim();
        if (!code || !time) return;

        // Check for week restrictions
        const weekEl = row.querySelector('rozvrhove_tydny');
        let parity = 'každý';
        if (weekEl) {
          const weeks = weekEl.textContent.trim();
          parity = `týdny:${weeks}`;
        }

        // Check poznámka for this subject — look for "začne DD.MM.YYYY" near the code
        let startDate = '';
        const codeEsc = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const startRe = new RegExp(codeEsc + '[\\s\\S]{0,300}začne\\s+(\\d{1,2}\\.\\d{1,2}\\.\\d{4})|začne\\s+(\\d{1,2}\\.\\d{1,2}\\.\\d{4})[\\s\\S]{0,300}' + codeEsc, 'i');
        const startMatch = detailText.match(startRe);
        if (startMatch) startDate = startMatch[1] || startMatch[2];

        // Also check for teaching week numbers: "t: 8,9,10,11,12,13,14"
        const poznamkaCell = cells.length > 5 ? cells[cells.length - 1] : null;
        const poznamka = poznamkaCell ? poznamkaCell.textContent.trim() : '';
        const weekMatch = poznamka.match(/t:\s*([\d,\s]+)/);
        if (weekMatch && parity === 'každý') {
          parity = `týdny:${weekMatch[1].replace(/\s/g, '')}`;
        }

        const key = `${dayIdx}-${code}-${time}-${parity}`;
        if (seen.has(key)) return;
        seen.add(key);
        const entry = { day: dayIdx, code, name, time, room, parity };
        if (startDate) entry.startDate = startDate;
        entries.push(entry);
      });
    });

    this.filterAndCache(entries);
  },

  async filterAndCache(entries) {
    try {
      // Filter out manually hidden entries (per day+code)
      const hiddenEntries = await KOS.getHiddenScheduleEntries();
      let filtered = entries;
      if (hiddenEntries.size > 0) {
        filtered = filtered.filter(e => !hiddenEntries.has(`${e.code}@${e.day}`));
      }

      KOS.cache('schedule', filtered);
      console.log('[KOS Upgrade] Cached', filtered.length, 'schedule entries:', filtered.map(e => `${e.code}@day${e.day}`).join(', '));
    } catch (err) {
      KOS.cache('schedule', entries);
      console.log('[KOS Upgrade] Cached', entries.length, 'schedule entries (unfiltered)');
    }
  }
};
