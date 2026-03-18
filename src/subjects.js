/**
 * KOS Upgrade – Subjects & Modules pages
 * Enhances in-place + caches data for homepage.
 */

const Subjects = {
  init() {
    const url = window.location.href;
    if (url.includes('subjects.do')) {
      this.enhanceAndCacheSubjects();
      // If refreshing, chain: subjects -> schedule -> modules -> home
      if (url.includes('refreshChain=1')) {
        setTimeout(() => KOS.navigate('studentMinutesSchedule.do?refreshChain=2'), 500);
      } else {
        this.checkPendingDetail('subject');
      }
    }
    if (url.includes('moduls.do')) {
      this.enhanceAndCacheModules();
      // If refreshing, go back home
      if (url.includes('refreshChain=3')) {
        setTimeout(() => KOS.navigate('toWelcome.do'), 500);
      } else {
        this.checkPendingDetail('module');
      }
    }
  },

  /** Auto-open a subject/module detail if requested from homepage */
  checkPendingDetail(type) {
    chrome.storage.local.get('pendingDetail', result => {
      const pending = result.pendingDetail;
      if (!pending || pending.type !== type) return;
      // Clear it immediately so it doesn't fire again
      chrome.storage.local.remove('pendingDetail');

      if (type === 'subject' && pending.id) {
        // Find and click the showSubjectDetail link
        const links = document.querySelectorAll('a[onclick*="showSubjectDetail"]');
        for (const link of links) {
          const onclick = link.getAttribute('onclick') || '';
          if (onclick.includes(`showSubjectDetail(${pending.id}`)) {
            console.log(`[KOS Upgrade] Auto-opening subject detail: ${pending.code} (id=${pending.id})`);
            setTimeout(() => link.click(), 300);
            return;
          }
        }
        // Fallback: try by code text
        if (pending.code) {
          const allLinks = document.querySelectorAll('a[onclick*="showSubjectDetail"]');
          for (const link of allLinks) {
            if (link.textContent.trim() === pending.code) {
              console.log(`[KOS Upgrade] Auto-opening subject by code: ${pending.code}`);
              setTimeout(() => link.click(), 300);
              return;
            }
          }
        }
        console.log(`[KOS Upgrade] Could not find detail link for subject ${pending.code}`);
      }

      if (type === 'module' && pending.code) {
        // Find the module header row with matching code and click its detail link
        const boldEls = document.querySelectorAll('td.tableHeader b');
        for (const b of boldEls) {
          if (b.textContent.trim() === pending.code) {
            // Find the closest link in this row
            const row = b.closest('tr');
            const link = row ? row.querySelector('a[onclick]') : null;
            if (link) {
              console.log(`[KOS Upgrade] Auto-opening module detail: ${pending.code}`);
              setTimeout(() => link.click(), 300);
              return;
            }
          }
        }
        console.log(`[KOS Upgrade] Could not find detail link for module ${pending.code}`);
      }
    });
  },

  // ── Předměty ──

  enhanceAndCacheSubjects() {
    const rows = document.querySelectorAll('tr.tableRow1, tr.tableRow2');
    if (rows.length === 0) return;

    const subjects = [];
    let totalCredits = 0, countZK = 0, countZ = 0;

    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length < 5) return;
      const code = cells[0].textContent.trim();
      if (!code || code.length < 3) return;

      const credits = parseInt(cells[3]?.textContent.trim()) || 0;
      const end = cells[4]?.textContent.trim() || '';
      totalCredits += credits;
      if (end === 'ZK') countZK++;
      if (end === 'Z') countZ++;

      // Extract subject detail ID from any link in the row
      let detailId = '';
      const allLinks = row.querySelectorAll('a');
      for (const link of allLinks) {
        const onclick = link.getAttribute('onclick') || '';
        const href = link.getAttribute('href') || '';
        for (const text of [onclick, href].filter(Boolean)) {
          const m1 = text.match(/showSubjectDetail\(\s*(\d+)/);
          if (m1) { detailId = m1[1]; break; }
          const m2 = text.match(/viewSubject\([^)]*,\s*(\d+)\s*\)/);
          if (m2) { detailId = m2[1]; break; }
          const m3 = text.match(/subjectId=(\d+)/);
          if (m3) { detailId = m3[1]; break; }
          const m4 = text.match(/\(\s*(\d{2,})\s*[,)]/);
          if (m4) { detailId = m4[1]; break; }
        }
        if (detailId) break;
      }
      if (!detailId) {
        const html = row.innerHTML;
        const m = html.match(/showSubjectDetail\(\s*(\d+)/);
        if (m) detailId = m[1];
      }

      subjects.push({
        code,
        name: cells[1].textContent.trim().split('\n')[0].trim(),
        credits: String(credits),
        end,
        detailId
      });
    });

    // Add summary bar
    const titleRow = document.querySelector('.tableHeader[title="Seznam předmětů"]');
    if (titleRow) {
      const summary = KOS.el('div', { className: 'kos-subjects-summary' },
        KOS.el('span', {}, `${rows.length} předmětů`),
        KOS.el('span', { className: 'kos-subjects-summary__sep' }, '|'),
        KOS.el('span', {}, `${totalCredits} kreditů`),
        KOS.el('span', { className: 'kos-subjects-summary__sep' }, '|'),
        KOS.el('span', {}, `${countZK} zkoušek, ${countZ} zápočtů`)
      );
      titleRow.parentNode.parentNode.insertBefore(
        KOS.el('tr', {}, KOS.el('td', { colspan: '10' }, summary)),
        titleRow.parentNode.nextSibling
      );
    }

    KOS.cache('subjects', subjects);
    console.log(`[KOS Upgrade] Cached ${subjects.length} subjects`);
  },

  // ── Moduly ──

  enhanceAndCacheModules() {
    const now = new Date();

    // Highlight deadlines in the available modules table
    const seznamPr = document.getElementById('seznamPr');
    if (seznamPr) {
      seznamPr.querySelectorAll('tr.tableRow1, tr.tableRow2').forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 8) return;
        const deadlineText = cells[7]?.textContent.trim();
        if (!deadlineText) return;
        const dd = KOS.parseCzDate(deadlineText);
        if (!dd) return;
        const daysLeft = Math.ceil((dd - now) / 86400000);
        if (daysLeft < 0) {
          row.classList.add('kos-module-past');
        } else if (daysLeft <= 2) {
          row.classList.add('kos-module-urgent-row');
          cells[7].appendChild(KOS.el('span', { className: 'kos-deadline-badge kos-deadline-badge--urgent' },
            daysLeft === 0 ? ' DNES!' : daysLeft === 1 ? ' ZÍTRA!' : ` ${daysLeft} dny`));
        } else if (daysLeft <= 7) {
          row.classList.add('kos-module-soon-row');
          cells[7].appendChild(KOS.el('span', { className: 'kos-deadline-badge kos-deadline-badge--soon' },
            ` ${daysLeft} dní`));
        }
        const spots = parseInt(cells[5]?.textContent.trim());
        if (!isNaN(spots) && spots <= 3) cells[5].classList.add('kos-spots-low');
      });
    }

    // Cache modules data
    const enrolled = this.extractTable(document.getElementById('seznamPrZapsane'));
    const available = this.extractTable(document.getElementById('seznamPr'));
    KOS.cache('modules', { enrolled, available });
    console.log(`[KOS Upgrade] Cached ${enrolled.length} enrolled, ${available.length} available modules`);
  },

  extractTable(table) {
    if (!table) return [];
    const modules = [];
    let current = null;
    for (const row of table.querySelectorAll('tr')) {
      const hCells = row.querySelectorAll('td.tableHeader');
      if (hCells.length >= 2) {
        const codeEl = hCells[0].querySelector('b');
        const nameEl = hCells[1].querySelector('b');
        if (codeEl && nameEl && codeEl.textContent.trim() && nameEl.textContent.trim()) {
          const lastCell = hCells[hCells.length - 1];
          current = {
            code: codeEl.textContent.trim(),
            name: nameEl.textContent.trim(),
            credits: lastCell ? lastCell.textContent.trim() : '',
            date: '', time: '', room: '', spots: '', deadline: ''
          };
          modules.push(current);
        }
      }
      if (current && (row.classList.contains('tableRow1') || row.classList.contains('tableRow2'))) {
        const c = row.querySelectorAll('td');
        if (c.length >= 7) {
          current.date = c[1]?.textContent.trim() || '';
          current.time = c[2]?.textContent.trim() || '';
          current.room = c[3]?.textContent.trim() || '';
          current.spots = c[5]?.textContent.trim() || '';
          current.deadline = c[7]?.textContent.trim() || '';
        }
      }
    }
    return modules;
  }
};
