/**
 * KOS Upgrade – Homepage
 * Shows cached data with mini visual schedule grid.
 *
 * Limitation: KOS uses server-side session state for subject/module detail pages.
 * subjectDetail.do?page=XXX has no subject identifier in the URL — the subject
 * was selected via showSubjectDetail() form POST on subjects.do.
 * → We can only navigate to the list pages, not directly to a specific detail.
 */

const Homepage = {
  init() {
    const url = window.location.href;
    // Known non-home pages — don't inject dashboard on these
    const nonHomePages = ['subjects.do', 'moduls.do', 'studentMinutesSchedule.do',
      'subjectDetail.do', 'results.do', 'examsTerms.do', 'examsView.do',
      'subjectsCode.do', 'structuredSubjectsPlan.do', 'studentDetail.do',
      'logout.do', 'minutesSchedule.do'];
    const isNonHome = nonHomePages.some(p => url.includes(p));
    if (isNonHome) return;
    this.waitForPanel(() => this.enhance());
  },

  waitForPanel(callback, n = 0) {
    const panel = document.getElementById('main-panel');
    if (panel) { callback(); return; }
    if (n < 20) setTimeout(() => this.waitForPanel(callback, n + 1), 200);
  },

  async enhance() {
    // Prevent double-inject
    if (document.querySelector('.kos-dashboard')) return;

    const dashboard = KOS.el('div', { className: 'kos-dashboard' });

    // Top bar: date + week
    dashboard.appendChild(this.createTopBar());

    // Mini rozvrh (full width)
    dashboard.appendChild(await this.createMiniSchedule());

    // Bottom row: Předměty + Moduly side by side
    const bottomRow = KOS.el('div', { className: 'kos-bottom-row' });
    bottomRow.appendChild(await this.createSubjectsCard());
    bottomRow.appendChild(await this.createModulesCard());
    dashboard.appendChild(bottomRow);

    // Footer: archive + refresh
    const footer = KOS.el('div', { className: 'kos-footer-row' });
    footer.appendChild(await this.createArchiveLink());
    footer.appendChild(KOS.el('a', {
      className: 'kos-link', href: '#',
      title: 'Stáhne sylabus všech předmětů na pozadí',
      async onClick(e) {
        e.preventDefault();
        await Homepage.archiveAllSyllabi();
      }
    }, 'Archivovat vše'));
    footer.appendChild(KOS.el('a', {
      className: 'kos-link kos-refresh-link', href: '#',
      title: 'Stáhne předměty, rozvrh a moduly na pozadí bez přesměrování',
      async onClick(e) {
        e.preventDefault();
        await Homepage.headlessRefresh();
      }
    }, 'Obnovit data'));
    dashboard.appendChild(footer);

    // Move global nav bar to TOP of dashboard (main.js inserts it into #main-panel before us)
    const existingNav = document.querySelector('.kos-nav-global');
    if (existingNav) dashboard.insertBefore(existingNav, dashboard.firstChild);

    const mainPanel = document.getElementById('main-panel');
    if (mainPanel) mainPanel.insertBefore(dashboard, mainPanel.firstChild);

    // Start countdown AFTER dashboard is in the DOM (clear any previous interval)
    if (this._countdownInterval) clearInterval(this._countdownInterval);
    this.updateCountdown();
    this._countdownInterval = setInterval(() => this.updateCountdown(), 30000);

    // Auto-refresh data in the background (silent, no overlay)
    // Skip if this enhance() was triggered by a silent refresh (prevent infinite loop)
    // On login.do, only auto-refresh if we actually found a valid page code
    if (!this._refreshing) {
      const isLogin = window.location.href.includes('login.do');
      const hasPageCode = !!KOS.getPageCode();
      if (!isLogin || hasPageCode) {
        setTimeout(() => this.headlessRefresh({ silent: true }), 2000);
      }
    }
  },

  // ── Top bar ──

  createTopBar() {
    const isOdd = KOS.isOddWeek();
    const weekNum = KOS.getISOWeek(new Date());
    const now = new Date();
    const timeStr = now.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });

    const topbar = KOS.el('div', { className: 'kos-topbar' },
      KOS.el('span', { className: 'kos-topbar__date' },
        `${KOS.DAYS[now.getDay()]} ${now.getDate()}. ${KOS.MONTHS[now.getMonth()]} ${now.getFullYear()}, ${timeStr}`
      ),
      KOS.el('span', { className: 'kos-topbar__countdown', id: 'kos-countdown' }),
      KOS.el('span', { className: `kos-topbar__week kos-topbar__week--${isOdd ? 'odd' : 'even'}` },
        `${isOdd ? 'Lichý' : 'Sudý'} týden (${weekNum})`
      )
    );

    return topbar;
  },

  async updateCountdown() {
    const el = document.getElementById('kos-countdown');
    if (!el) return;

    const cached = await KOS.getCache('schedule');
    if (!cached || !cached.data) { el.textContent = ''; return; }

    const now = new Date();
    const todayDay = now.getDay() - 1;
    if (todayDay < 0 || todayDay > 4) { el.textContent = ''; return; }

    const isOdd = KOS.isOddWeek();
    const hiddenEntries = await KOS.getHiddenScheduleEntries();
    const todayEntries = cached.data
      .filter(e => e.day === todayDay && !hiddenEntries.has(`${e.code}@${e.day}`))
      .filter(e => KOS.isEntryActive(e.parity, isOdd))
      .filter(e => !e.startDate || !KOS.parseCzDate(e.startDate) || KOS.parseCzDate(e.startDate) <= new Date())
      .filter(e => e.time)
      .map(e => {
        const [s, en] = e.time.split('-').map(t => t.trim());
        const [sh, sm] = s.split(':').map(Number);
        const [eh, em] = en.split(':').map(Number);
        return { ...e, startMin: sh * 60 + (sm || 0), endMin: eh * 60 + (em || 0) };
      })
      .sort((a, b) => a.startMin - b.startMin);

    const nowMin = now.getHours() * 60 + now.getMinutes();

    const current = todayEntries.find(e => nowMin >= e.startMin && nowMin < e.endMin);
    if (current) {
      const left = current.endMin - nowMin;
      el.textContent = `${current.name} — konec za ${left} min`;
      el.className = 'kos-topbar__countdown kos-topbar__countdown--active';
      return;
    }

    const next = todayEntries.find(e => e.startMin > nowMin);
    if (next) {
      const until = next.startMin - nowMin;
      const h = Math.floor(until / 60);
      const m = until % 60;
      const timeLabel = h > 0 ? `${h}h ${m}min` : `${m} min`;
      el.textContent = `${next.name} za ${timeLabel}`;
      el.className = 'kos-topbar__countdown kos-topbar__countdown--upcoming';
      return;
    }

    el.textContent = '';
    el.className = 'kos-topbar__countdown';
  },

  // ── Mini rozvrh grid ──

  async createMiniSchedule() {
    const cached = await KOS.getCache('schedule');
    const hiddenEntries = await KOS.getHiddenScheduleEntries();

    const card = KOS.el('div', { className: 'kos-card kos-card--schedule' },
      KOS.el('div', { className: 'kos-card__header kos-card__header--clickable',
        onClick: () => KOS.navigate('studentMinutesSchedule.do') }, 'Rozvrh')
    );

    const body = KOS.el('div', { className: 'kos-card__body kos-card__body--flush' });
    card.appendChild(body);

    if (!cached) {
      body.classList.remove('kos-card__body--flush');
      body.appendChild(KOS.el('a', { className: 'kos-link', href: '#',
        onClick(e) { e.preventDefault(); KOS.navigate('studentMinutesSchedule.do'); }
      }, 'Otevři rozvrh pro zobrazení'));
      return card;
    }

    // Filter out hidden entries (per day+code)
    const entries = cached.data.filter(e => !hiddenEntries.has(`${e.code}@${e.day}`));
    const isOdd = KOS.isOddWeek();
    const todayDayIdx = new Date().getDay();

    // Find time range
    const times = entries.map(e => e.time).filter(Boolean);
    let minHour = 24, maxHour = 0;
    times.forEach(t => {
      const [start, end] = t.split('-').map(s => parseInt(s.trim()));
      if (start < minHour) minHour = start;
      const endParts = t.split('-')[1]?.trim().split(':');
      if (endParts) {
        const eh = parseInt(endParts[0]);
        if (eh > maxHour) maxHour = eh;
      }
    });
    if (minHour >= maxHour) { minHour = 8; maxHour = 20; }
    minHour = Math.max(7, minHour);
    maxHour = Math.min(22, maxHour + 1);
    const totalHours = maxHour - minHour;

    const DAYS = ['Po', 'Út', 'St', 'Čt', 'Pá'];
    const grid = KOS.el('div', { className: 'kos-grid' });

    // Header row
    const headerRow = KOS.el('div', { className: 'kos-grid__row kos-grid__row--header' });
    headerRow.appendChild(KOS.el('div', { className: 'kos-grid__daycell' }));
    for (let h = minHour; h < maxHour; h++) {
      headerRow.appendChild(KOS.el('div', { className: 'kos-grid__hourcell' }, `${h}`));
    }
    grid.appendChild(headerRow);

    // Day rows
    for (let d = 0; d < 5; d++) {
      const isToday = (d + 1) === todayDayIdx;
      const dayRow = KOS.el('div', {
        className: `kos-grid__row ${isToday ? 'kos-grid__row--today' : ''}`
      });
      dayRow.appendChild(KOS.el('div', {
        className: `kos-grid__daycell ${isToday ? 'kos-grid__daycell--today' : ''}`
      }, DAYS[d]));

      const track = KOS.el('div', { className: 'kos-grid__track' });
      track.style.gridTemplateColumns = `repeat(${totalHours * 4}, 1fr)`;

      for (let h = 0; h < totalHours; h++) {
        const line = KOS.el('div', { className: 'kos-grid__hourline' });
        line.style.gridColumn = `${h * 4 + 1}`;
        line.style.gridRow = '1';
        track.appendChild(line);
      }

      const dayEntries = entries.filter(e => e.day === d);
      for (const e of dayEntries) {
        if (!e.time) continue;
        const [startStr, endStr] = e.time.split('-').map(s => s.trim());
        const startSlot = this.timeToSlot(startStr, minHour);
        const endSlot = this.timeToSlot(endStr, minHour);
        if (startSlot < 0 || endSlot <= startSlot) continue;

        const isActive = KOS.isEntryActive(e.parity, isOdd);
        // Check if entry has a deferred start date that hasn't arrived yet
        const isDeferred = e.startDate && KOS.parseCzDate(e.startDate) && KOS.parseCzDate(e.startDate) > new Date();
        const isDim = !isActive || isDeferred;

        const block = KOS.el('div', {
          className: `kos-grid__block ${isDim ? 'kos-grid__block--dim' : ''} ${isToday && !isDim ? 'kos-grid__block--today' : ''}`,
          title: `${e.code} — ${e.name}\n${e.time} · ${e.room}${e.parity !== 'každý' ? ' · ' + e.parity.replace('týdny:', 't:') : ''}${isDeferred ? '\nZačíná ' + e.startDate : ''}\nklik = sylabus`
        },
          KOS.el('span', { className: 'kos-grid__block-time' }, e.time),
          KOS.el('span', { className: 'kos-grid__block-name' }, e.name)
        );

        if (e.parity !== 'každý') {
          block.appendChild(KOS.el('span', {
            className: `kos-grid__block-parity ${isActive ? 'kos-grid__block-parity--active' : ''}`
          }, e.parity.charAt(0).toUpperCase()));
        }

        // Click block name to show syllabus
        block.addEventListener('click', (ev) => {
          if (ev.target.closest('.kos-grid__block-hide')) return;
          Homepage.showSyllabusModal(e.code, e.name);
        });

        // × button to hide this specific entry (per day)
        const hideBtn = KOS.el('button', {
          className: 'kos-grid__block-hide',
          title: `Skrýt ${e.code} z tohoto dne`,
          onClick(ev) {
            ev.stopPropagation();
            const dayName = ['Po','Út','St','Čt','Pá'][e.day] || '';
            if (confirm(`Skrýt "${e.name}" (${e.code}) z ${dayName}?`)) {
              KOS.hideScheduleEntry(e.code, e.day).then(() => {
                document.querySelectorAll('.kos-grid__block').forEach(b => {
                  if (b.dataset.code === e.code && b.dataset.day === String(e.day)) b.remove();
                });
              });
            }
          }
        }, '×');
        block.appendChild(hideBtn);
        block.dataset.code = e.code;
        block.dataset.day = e.day;

        block.style.gridColumn = `${startSlot + 1} / ${endSlot + 1}`;
        block.style.gridRow = '1';
        track.appendChild(block);
      }

      dayRow.appendChild(track);
      grid.appendChild(dayRow);
    }

    body.appendChild(grid);

    // Hidden entries unhide link
    if (hiddenEntries.size > 0) {
      const hiddenLink = KOS.el('a', {
        className: 'kos-link kos-hidden-toggle', href: '#',
        onClick(ev) {
          ev.preventDefault();
          const list = document.getElementById('kos-hidden-list');
          if (list) list.style.display = list.style.display === 'none' ? 'block' : 'none';
        }
      }, `Skryté položky (${hiddenEntries.size})`);
      body.appendChild(hiddenLink);

      const hiddenList = KOS.el('div', { id: 'kos-hidden-list', className: 'kos-hidden-list', style: { display: 'none' } });
      const DAYS = ['Po', 'Út', 'St', 'Čt', 'Pá'];
      for (const key of hiddenEntries) {
        const [code, dayStr] = key.split('@');
        const dayName = DAYS[parseInt(dayStr)] || dayStr;
        // Try to find the name from cached data
        const match = cached.data.find(e => e.code === code);
        const label = match ? `${match.name} (${code}) — ${dayName}` : `${code} — ${dayName}`;

        const row = KOS.el('div', { className: 'kos-hidden-row' },
          KOS.el('span', {}, label),
          KOS.el('a', {
            className: 'kos-link', href: '#',
            onClick(ev) {
              ev.preventDefault();
              KOS.unhideScheduleEntry(code, parseInt(dayStr)).then(() => {
                row.remove();
                // Update counter
                const remaining = document.querySelectorAll('.kos-hidden-row').length;
                if (remaining === 0) {
                  hiddenLink.remove();
                  hiddenList.remove();
                } else {
                  hiddenLink.textContent = `Skryté položky (${remaining})`;
                }
              });
            }
          }, 'Zobrazit')
        );
        hiddenList.appendChild(row);
      }
      body.appendChild(hiddenList);
    }

    body.appendChild(KOS.el('div', { className: 'kos-cache-info' }, KOS.timeAgo(cached.ts)));
    return card;
  },

  async showSyllabusModal(code, name) {
    const archive = await SyllabusArchive.getArchive();
    // Try exact match first, then search by code substring or name match
    let entry = archive[code];
    if (!entry) {
      for (const [key, val] of Object.entries(archive)) {
        if (key === code || val.code === code ||
            (name && val.name && val.name.toLowerCase() === name.toLowerCase())) {
          entry = val;
          break;
        }
      }
    }

    // Remove existing overlay if any
    document.querySelector('.kos-syllabus-overlay')?.remove();

    const overlay = KOS.el('div', { className: 'kos-syllabus-overlay' });
    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) overlay.remove();
    });

    const modal = KOS.el('div', { className: 'kos-syllabus-modal' });

    const header = KOS.el('div', { className: 'kos-syllabus-modal__header' },
      KOS.el('span', {}, `${code} — ${name}`),
      KOS.el('button', { className: 'kos-syllabus-modal__close', onClick: () => overlay.remove() }, '×')
    );
    modal.appendChild(header);

    // Check if archive entry is usable (not corrupted with JS code)
    const isCorrupted = entry && entry.text && (entry.text.includes('var isVisible') || entry.text.includes('function setAction'));
    const hasCleanData = entry && entry.sections && Object.keys(entry.sections).length > 0;

    if (hasCleanData) {
      // Show structured sections
      const body = KOS.el('div', { className: 'kos-syllabus-modal__body' });
      if (entry.meta) {
        const metaLine = Object.entries(entry.meta).map(([k, v]) => `${k}: ${v}`).join(' · ');
        body.appendChild(KOS.el('div', { className: 'kos-syllabus-modal__meta' }, metaLine));
      }
      for (const [heading, content] of Object.entries(entry.sections)) {
        body.appendChild(KOS.el('h4', {}, heading));
        body.appendChild(this.formatSyllabusContent(content));
      }
      modal.appendChild(body);
    } else if (entry && entry.text && !isCorrupted) {
      const body = KOS.el('div', { className: 'kos-syllabus-modal__body' }, entry.text);
      modal.appendChild(body);
    } else {
      const empty = KOS.el('div', { className: 'kos-syllabus-modal__body' });

      // Show cached module/subject info if available
      const moduleInfo = await this.findCachedInfo(code);
      if (moduleInfo) {
        const infoDiv = KOS.el('div', { className: 'kos-syllabus-modal__meta' });
        const parts = [];
        if (moduleInfo.date) parts.push(`Datum: ${moduleInfo.date}`);
        if (moduleInfo.time) parts.push(`Cas: ${moduleInfo.time}`);
        if (moduleInfo.room) parts.push(`Mistnost: ${moduleInfo.room}`);
        if (moduleInfo.credits) parts.push(`Kredity: ${moduleInfo.credits}`);
        if (moduleInfo.end) parts.push(`Zakonceni: ${moduleInfo.end}`);
        if (moduleInfo.deadline) parts.push(`Deadline: ${moduleInfo.deadline}`);
        if (moduleInfo.spots) parts.push(`Mist: ${moduleInfo.spots}`);
        infoDiv.textContent = parts.join(' · ');
        empty.appendChild(infoDiv);
      }

      if (isCorrupted) {
        empty.appendChild(KOS.el('div', { style: { margin: '12px 0', color: '#999' } }, 'Archiv obsahuje zastaralá data.'));
      } else {
        empty.appendChild(KOS.el('div', { style: { margin: '12px 0', color: '#999' } }, 'Sylabus se archivuje na pozadí...'));
      }

      // Links to open in KOS or archive
      const links = KOS.el('div', { style: { marginTop: '12px', display: 'flex', gap: '12px' } });
      links.appendChild(KOS.el('a', { className: 'kos-link', href: '#',
        onClick(ev) {
          ev.preventDefault(); overlay.remove();
          chrome.storage.local.set({ pendingDetail: { type: 'module', code } }, () => {
            KOS.navigate('moduls.do');
          });
        }
      }, 'Otevrit v KOS'));
      links.appendChild(KOS.el('a', { className: 'kos-link', href: '#',
        onClick(ev) { ev.preventDefault(); overlay.remove(); Homepage.archiveAllSyllabi(); }
      }, 'Archivovat vše'));
      empty.appendChild(links);
      modal.appendChild(empty);
    }

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // ESC to close
    const onKey = (ev) => { if (ev.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);
  },

  /** Format syllabus content — detect date+teacher patterns and make them readable */
  formatSyllabusContent(text) {
    if (!text) return KOS.el('div', { className: 'kos-syllabus-modal__section' });

    // Detect numbered lecture entries like "1/ 11. 2. Petr Kubica: Topic..."
    // Also handles compact dates like "4.3. FAMUFEST - výuka odpadá"
    // Match: N/ DD. MM. (numbered with spaced date) or DD.MM. (compact bare date)
    const entryRe = /(?:^|\n)\s*(?:(\d{1,2})\s*[/.)]\s*(\d{1,2}\.\s*\d{1,2}\.)|(\d{1,2}\.\d{1,2}\.)(?=\s))\s*/g;
    const matches = [...text.matchAll(entryRe)];

    if (matches.length >= 3) {
      const list = KOS.el('div', { className: 'kos-syllabus-schedule' });

      // Add any preamble text before first entry
      const preamble = text.substring(0, matches[0].index).trim();
      if (preamble) {
        list.appendChild(KOS.el('div', { className: 'kos-schedule-note' }, preamble));
      }

      for (let i = 0; i < matches.length; i++) {
        const m = matches[i];
        const num = m[1] || '';
        const date = (m[2] || m[3] || '').trim();
        const dateLabel = num ? `${num}/ ${date}` : date;
        // Content extends from end of this match to start of next match (or end of string)
        const contentStart = m.index + m[0].length;
        const contentEnd = i + 1 < matches.length ? matches[i + 1].index : text.length;
        const content = text.substring(contentStart, contentEnd).trim();

        // Split by first colon to get teacher and topic
        const colonIdx = content.indexOf(':');
        let teacher = '', topic = content;
        if (colonIdx > 0 && colonIdx < 60) {
          // Only treat as teacher:topic if the part before colon looks like a name
          const beforeColon = content.substring(0, colonIdx).trim();
          if (/^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/.test(beforeColon) && !beforeColon.includes('\n')) {
            teacher = beforeColon;
            topic = content.substring(colonIdx + 1).trim();
          }
        }

        const row = KOS.el('div', { className: 'kos-schedule-item' });
        row.appendChild(KOS.el('span', { className: 'kos-schedule-date' }, dateLabel));
        if (teacher) {
          row.appendChild(KOS.el('span', { className: 'kos-schedule-teacher' }, teacher));
        }
        if (topic) {
          row.appendChild(KOS.el('span', { className: 'kos-schedule-topic' }, topic));
        }
        list.appendChild(row);
      }
      return list;
    }

    // Fallback: detect bare "DD. MM." date entries without number prefix
    const bareDateRe = /(?:^|\n)\s*(\d{1,2}\.\s*\d{1,2}\.)\s+/g;
    const bareMatches = [...text.matchAll(bareDateRe)];
    if (bareMatches.length >= 3) {
      const list = KOS.el('div', { className: 'kos-syllabus-schedule' });
      const preamble = text.substring(0, bareMatches[0].index).trim();
      if (preamble) list.appendChild(KOS.el('div', { className: 'kos-schedule-note' }, preamble));

      for (let i = 0; i < bareMatches.length; i++) {
        const m = bareMatches[i];
        const date = m[1].trim();
        const contentStart = m.index + m[0].length;
        const contentEnd = i + 1 < bareMatches.length ? bareMatches[i + 1].index : text.length;
        const content = text.substring(contentStart, contentEnd).trim();

        const row = KOS.el('div', { className: 'kos-schedule-item' });
        row.appendChild(KOS.el('span', { className: 'kos-schedule-date' }, date));
        row.appendChild(KOS.el('span', { className: 'kos-schedule-topic' }, content));
        list.appendChild(row);
      }
      return list;
    }

    // Default: plain text
    return KOS.el('div', { className: 'kos-syllabus-modal__section' }, text);
  },

  /** Find cached info about a subject/module from subjects or modules cache */
  async findCachedInfo(code) {
    const subjects = await KOS.getCache('subjects');
    if (subjects && subjects.data) {
      const s = subjects.data.find(x => x.code === code);
      if (s) return s;
    }
    const modules = await KOS.getCache('modules');
    if (modules && modules.data) {
      for (const m of [...(modules.data.enrolled || []), ...(modules.data.available || [])]) {
        if (m.code === code) return m;
      }
    }
    return null;
  },

  timeToSlot(timeStr, minHour) {
    const [h, m] = timeStr.split(':').map(Number);
    return (h - minHour) * 4 + Math.round(m / 15);
  },

  // ── Předměty (compact, clickable → subjects.do) ──

  async createSubjectsCard() {
    const cached = await KOS.getCache('subjects');
    const modulesCached = await KOS.getCache('modules');

    const card = KOS.el('div', { className: 'kos-card' },
      KOS.el('div', { className: 'kos-card__header kos-card__header--clickable',
        onClick: () => KOS.navigate('subjects.do') }, 'Zapsané předměty')
    );
    const body = KOS.el('div', { className: 'kos-card__body' });
    card.appendChild(body);

    if (!cached) {
      body.appendChild(KOS.el('a', { className: 'kos-link', href: '#',
        onClick(e) { e.preventDefault(); KOS.navigate('subjects.do'); }
      }, 'Otevři předměty'));
      return card;
    }

    // Filter out modules from subjects list
    const moduleCodes = new Set();
    if (modulesCached && modulesCached.data) {
      const { enrolled, available } = modulesCached.data;
      for (const m of [...(enrolled || []), ...(available || [])]) {
        if (m.code) moduleCodes.add(m.code);
      }
    }

    const subjects = cached.data.filter(s => !moduleCodes.has(s.code));
    const totalCredits = subjects.reduce((s, x) => s + (parseInt(x.credits) || 0), 0);
    const zkCount = subjects.filter(s => s.end === 'ZK').length;
    const zCount = subjects.filter(s => s.end === 'Z').length;

    body.appendChild(KOS.el('div', { className: 'kos-summary' },
      `${subjects.length} předm. · ${totalCredits} kr · ${zkCount} zk / ${zCount} záp`
    ));

    const table = KOS.el('div', { className: 'kos-subj-table' });
    for (const s of subjects) {
      const row = KOS.el('div', { className: 'kos-subj-row kos-subj-row--clickable' },
        KOS.el('span', { className: 'kos-subj-name' }, s.name),
        KOS.el('span', { className: 'kos-subj-credits' }, `${s.credits}`),
        KOS.el('span', { className: `kos-tag kos-tag--${s.end === 'ZK' ? 'orange' : 'green'}` }, s.end)
      );
      row.addEventListener('click', () => {
        Homepage.showSyllabusModal(s.code, s.name);
      });
      table.appendChild(row);
    }
    body.appendChild(table);
    body.appendChild(KOS.el('div', { className: 'kos-cache-info' }, KOS.timeAgo(cached.ts)));
    return card;
  },

  // ── Syllabus archive ──

  async createArchiveLink() {
    const count = await SyllabusArchive.getArchiveCount();

    if (count === 0) {
      return KOS.el('span', { className: 'kos-cache-info' },
        'Archiv sylabu: otevři detail předmětu pro archivaci'
      );
    }

    return KOS.el('a', {
      className: 'kos-link', href: '#',
      onClick(e) { e.preventDefault(); SyllabusArchive.exportArchive(); }
    }, `📥 Stáhnout archiv sylabu (${count})`);
  },

  // ── Zapsané moduly only ──

  async createModulesCard() {
    const cached = await KOS.getCache('modules');
    if (!cached) return KOS.el('div');

    const { enrolled } = cached.data;
    if (enrolled.length === 0) return KOS.el('div');

    const card = KOS.el('div', { className: 'kos-card' },
      KOS.el('div', { className: 'kos-card__header kos-card__header--clickable',
        onClick: () => KOS.navigate('moduls.do') }, 'Zapsané moduly')
    );
    const body = KOS.el('div', { className: 'kos-card__body' });
    card.appendChild(body);

    const now = new Date();

    // Sort: nearest upcoming first, then past (most recent first)
    const sorted = [...enrolled].map(m => {
      const dd = m.date ? KOS.parseCzDate(m.date) : null;
      const diff = dd ? Math.ceil((dd - now) / 86400000) : null;
      return { ...m, _parsed: dd, _diff: diff };
    }).sort((a, b) => {
      const aFuture = a._diff !== null && a._diff >= 0;
      const bFuture = b._diff !== null && b._diff >= 0;
      if (aFuture && !bFuture) return -1;
      if (!aFuture && bFuture) return 1;
      if (aFuture && bFuture) return a._diff - b._diff;
      // Both past — most recent first
      if (a._diff !== null && b._diff !== null) return b._diff - a._diff;
      return 0;
    });

    for (const m of sorted) body.appendChild(this.renderEnrolledModule(m, now));

    body.appendChild(KOS.el('div', { className: 'kos-cache-info' }, KOS.timeAgo(cached.ts)));
    return card;
  },

  renderEnrolledModule(m, now) {
    let dateLabel = '';
    let urgent = false, soon = false;
    let dd = null, daysUntil = null;

    if (m.date) {
      dd = KOS.parseCzDate(m.date);
      daysUntil = dd ? Math.ceil((dd - now) / 86400000) : null;

      if (daysUntil !== null && daysUntil === 0) dateLabel = 'DNES';
      else if (daysUntil !== null && daysUntil === 1) dateLabel = 'ZITRA';
      else if (daysUntil !== null && daysUntil > 1 && daysUntil <= 14) dateLabel = `za ${daysUntil} dni`;
      else dateLabel = m.date;

      urgent = daysUntil !== null && daysUntil <= 2 && daysUntil >= 0;
      soon = daysUntil !== null && daysUntil <= 7 && daysUntil > 2;
    }

    const isPast = dd && daysUntil !== null && daysUntil < 0;

    const row = KOS.el('div', {
      className: `kos-mod-row kos-mod-row--clickable ${urgent ? 'kos-mod-row--urgent' : ''} ${soon ? 'kos-mod-row--soon' : ''} ${isPast ? 'kos-mod-row--past' : ''}`
    });

    if (dateLabel) {
      row.appendChild(KOS.el('span', {
        className: `kos-mod-date ${urgent ? 'kos-mod-deadline--urgent' : ''}`
      }, dateLabel));
    }
    if (m.time) {
      row.appendChild(KOS.el('span', { className: 'kos-mod-time' }, m.time));
    }

    row.appendChild(KOS.el('span', { className: 'kos-mod-name' }, m.name));

    if (m.room) row.appendChild(KOS.el('span', { className: 'kos-mod-meta' }, m.room));
    row.appendChild(KOS.el('span', { className: 'kos-mod-meta' }, `${m.credits} kr`));

    row.addEventListener('click', () => {
      Homepage.showSyllabusModal(m.code, m.name);
    });
    return row;
  },

  // ── Headless data refresh (no navigation) ──

  async headlessRefresh(opts = {}) {
    const silent = opts.silent || false;
    const pageCode = KOS.getPageCode();
    if (!pageCode) {
      if (!silent) {
        // Redirect to KOS home to get a fresh session with a valid page code
        window.open(KOS.BASE, '_self');
      }
      return;
    }

    // Save old available modules for diffing
    const oldModules = await KOS.getCache('modules');
    const oldAvailCodes = new Set((oldModules?.data?.available || []).map(m => m.code));

    // Don't clear cache upfront — overwrite each key as it succeeds
    // so a failed refresh doesn't leave the user with an empty dashboard

    let overlay = null;
    if (!silent) {
      overlay = this.createArchiveOverlay(3);
      document.body.appendChild(overlay);
    }

    const loadIframe = (url) => {
      return new Promise((resolve, reject) => {
        const frame = document.createElement('iframe');
        frame.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;left:-9999px;top:-9999px;';
        document.body.appendChild(frame);
        frame.onload = () => resolve(frame);
        setTimeout(() => { frame.remove(); reject(new Error('timeout: ' + url)); }, 20000);
        frame.src = url;
      });
    };

    const getPageCodeFromDoc = (doc) => {
      let pc = pageCode;
      doc.querySelectorAll('script').forEach(s => {
        const m = s.textContent.match(/pageCode\s*=\s*'([a-f0-9]+)'/);
        if (m) pc = m[1];
      });
      return pc;
    };

    try {
      // 1. Subjects
      if (overlay) this.updateArchiveOverlay(overlay, 1, 3, 'Načítám předměty...');
      const subjFrame = await loadIframe(`subjects.do?page=${pageCode}`);
      const subjDoc = subjFrame.contentDocument;
      if (subjDoc) {
        const subjects = [];
        subjDoc.querySelectorAll('tr.tableRow1, tr.tableRow2').forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length < 5) return;
          const code = cells[0].textContent.trim();
          if (!code || code.length < 3) return;
          subjects.push({
            code,
            name: cells[1]?.textContent.trim().split('\n')[0].trim() || '',
            credits: String(parseInt(cells[3]?.textContent.trim()) || 0),
            end: cells[4]?.textContent.trim() || '',
            detailId: Homepage.extractDetailId(row)
          });
        });
        KOS.cache('subjects', subjects);
        console.log(`[KOS] Headless: cached ${subjects.length} subjects`);
      }
      const pc2 = subjDoc ? getPageCodeFromDoc(subjDoc) : pageCode;
      subjFrame.remove();

      // 2. Schedule
      if (overlay) this.updateArchiveOverlay(overlay, 2, 3, 'Načítám rozvrh...');
      const schedFrame = await loadIframe(`studentMinutesSchedule.do?page=${pc2}`);
      const schedDoc = schedFrame.contentDocument;
      if (schedDoc) {
        const entries = [];
        const seen = new Set();
        const rozvrh = schedDoc.getElementById('rozvrh');
        if (rozvrh) {
          // Only search within FIRST rozvrh — second is alternatives/parallelky
          rozvrh.querySelectorAll('div[id^="detaillistek"]').forEach(detail => {
            const id = detail.id.replace('detaillistek', '');
            const text = detail.textContent;
            const code = (text.match(/Kód\s+předmětu\s*:\s*(\S+)/i) || [])[1] || '';
            const name = (text.match(/Název\s+předmětu\s*:\s*(.+?)(?:\s{2,}|\n|Týden|Kód|Čas|Místnost)/i) || [])[1]?.trim() || '';
            const parity = (text.match(/Týden\s+výuky\s*:\s*(lichý|sudý|každý)/i) || [])[1]?.toLowerCase() || 'každý';
            const time = (text.match(/Čas\s+výuky\s*:\s*(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})/i) || [])[1] || '';
            const room = (text.match(/Místnost\s*:\s*(\S+)/i) || [])[1] || '';
            if (!code && !time) return;

            rozvrh.querySelectorAll(`div[id="listek${id}"]`).forEach(listek => {
              if (listek.style.display === 'none') return;
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
        }

        // Also parse collision divs (divik) inside the first rozvrh
        if (rozvrh) {
          const DAY_NAMES = { 'pondělí': 0, 'ponděli': 0, 'úterý': 1, 'uterý': 1, 'utery': 1, 'středa': 2, 'streda': 2, 'čtvrtek': 3, 'ctvrtek': 3, 'pátek': 4, 'patek': 4 };
          rozvrh.querySelectorAll('div[id^="detaildivik"]').forEach(detail => {
            const divikId = detail.id.replace('detaildivik', '');
            const divik = rozvrh.querySelector(`div[id="divik${divikId}"]`);
            let dayIdx = -1;
            if (divik) {
              const top = parseInt(divik.style.top);
              if (!isNaN(top)) dayIdx = Math.floor(top / 120);
            }
            if (dayIdx < 0 || dayIdx > 4) {
              const headerText = detail.textContent;
              const dayMatch = headerText.match(/Kolize\s+\d+\s*:\s*\((\S+)/i);
              if (dayMatch) {
                const dn = dayMatch[1].toLowerCase().replace(/[^a-záéíóúůýčďěňřšťž]/g, '');
                if (DAY_NAMES[dn] !== undefined) dayIdx = DAY_NAMES[dn];
              }
            }
            if (dayIdx < 0 || dayIdx > 4) return;

            const detailText = detail.textContent;
            detail.querySelectorAll('tr').forEach(row => {
              const cells = row.querySelectorAll('td.ttSubjectRow1');
              if (cells.length < 5) return;
              const code = cells[0].textContent.trim();
              const name = cells[1].textContent.trim();
              const room = cells[2].textContent.trim();
              const time = cells[4].textContent.trim();
              if (!code || !time) return;
              const weekEl = row.querySelector('rozvrhove_tydny');
              let parity = 'každý';
              if (weekEl) parity = `týdny:${weekEl.textContent.trim()}`;

              // Check poznámka for deferred start date
              let startDate = '';
              const codeEsc = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const startRe = new RegExp(codeEsc + '[\\s\\S]{0,300}začne\\s+(\\d{1,2}\\.\\d{1,2}\\.\\d{4})|začne\\s+(\\d{1,2}\\.\\d{1,2}\\.\\d{4})[\\s\\S]{0,300}' + codeEsc, 'i');
              const startMatch = detailText.match(startRe);
              if (startMatch) startDate = startMatch[1] || startMatch[2];

              // Check for teaching week numbers in poznámka
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
        }

        // Filter hidden entries
        const hiddenEntries = await KOS.getHiddenScheduleEntries();
        const filtered = entries.filter(e => !hiddenEntries.has(`${e.code}@${e.day}`));
        KOS.cache('schedule', filtered);
        console.log(`[KOS] Headless: cached ${filtered.length} schedule entries`);
      }
      const pc3 = schedDoc ? getPageCodeFromDoc(schedDoc) : pc2;
      schedFrame.remove();

      // 3. Modules
      if (overlay) this.updateArchiveOverlay(overlay, 3, 3, 'Načítám moduly...');
      const modFrame = await loadIframe(`moduls.do?page=${pc3}`);
      const modDoc = modFrame.contentDocument;
      if (modDoc) {
        const extractTable = (table) => {
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
        };
        const enrolled = extractTable(modDoc.getElementById('seznamPrZapsane'));
        const available = extractTable(modDoc.getElementById('seznamPr'));
        KOS.cache('modules', { enrolled, available });
        console.log(`[KOS] Headless: cached ${enrolled.length} enrolled, ${available.length} available modules`);
      }
      modFrame.remove();

      if (silent) {
        // Detect new available modules
        const newModules = await KOS.getCache('modules');
        const newAvail = newModules?.data?.available || [];
        const brandNew = newAvail.filter(m => !oldAvailCodes.has(m.code));
        if (brandNew.length > 0) {
          this.showNewModulesToast(brandNew);
        }
        // Reload dashboard in place (with flag to prevent re-triggering refresh)
        this._refreshing = true;
        const dashboard = document.querySelector('.kos-dashboard');
        if (dashboard) {
          // Detach nav bar before removing dashboard so it survives the refresh
          const nav = dashboard.querySelector('.kos-nav-global');
          const mainPanel = document.getElementById('main-panel');
          if (nav && mainPanel) mainPanel.insertBefore(nav, mainPanel.firstChild);
          dashboard.remove();
          await this.enhance();
        }
        this._refreshing = false;
        console.log('[KOS] Silent refresh done');

        // Auto-archive syllabi in background (lazy loading)
        setTimeout(() => this.backgroundArchive(), 3000);
      } else {
        this.updateArchiveOverlay(overlay, 3, 3, 'Hotovo! Obnovuji stránku...');
        setTimeout(() => { overlay.remove(); window.location.reload(); }, 800);
      }

    } catch (err) {
      console.error('[KOS] Headless refresh error:', err);
      if (overlay) overlay.remove();
      if (!silent) alert('Obnovení dat selhalo: ' + err.message);
    }
  },

  showNewModulesToast(modules) {
    const toast = KOS.el('div', { className: 'kos-toast' });
    toast.appendChild(KOS.el('div', { className: 'kos-toast__title' }, `${modules.length} ${modules.length === 1 ? 'nový modul' : 'nové moduly'} v KOS`));
    for (const m of modules) {
      const row = KOS.el('div', { className: 'kos-toast__item' });
      row.appendChild(KOS.el('b', {}, m.code));
      row.appendChild(document.createTextNode(` ${m.name}`));
      if (m.deadline) row.appendChild(KOS.el('span', { className: 'kos-toast__meta' }, ` · do ${m.deadline}`));
      if (m.spots) row.appendChild(KOS.el('span', { className: 'kos-toast__meta' }, ` · ${m.spots} míst`));
      toast.appendChild(row);
    }
    toast.appendChild(KOS.el('button', { className: 'kos-toast__close', onClick: () => toast.remove() }, '×'));
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 30000);
  },

  /** Silent background archive — archives all syllabi without UI overlay */
  async backgroundArchive() {
    if (this._archiving) return;
    this._archiving = true;
    try {
      const archive = await SyllabusArchive.getArchive();
      const archivedCodes = new Set(Object.keys(archive));
      // Also check by code field
      for (const val of Object.values(archive)) {
        if (val.code) archivedCodes.add(val.code);
      }

      // Check if there are un-archived subjects/modules
      const subjects = await KOS.getCache('subjects');
      const modules = await KOS.getCache('modules');
      const allCodes = new Set();
      if (subjects && subjects.data) subjects.data.forEach(s => allCodes.add(s.code));
      if (modules && modules.data) {
        (modules.data.enrolled || []).forEach(m => allCodes.add(m.code));
      }

      const missing = [...allCodes].filter(c => !archivedCodes.has(c));
      if (missing.length === 0) {
        console.log('[KOS] All syllabi already archived');
        this._archiving = false;
        return;
      }

      console.log(`[KOS] Background archive: ${missing.length} items to archive`);
      await this.archiveAllSyllabi({ silent: true });
    } catch (err) {
      console.warn('[KOS] Background archive failed:', err);
    }
    this._archiving = false;
  },

  // ── Headless syllabus archiving ──

  async archiveAllSyllabi(opts = {}) {
    const silent = opts.silent || false;
    const pageCode = KOS.getPageCode();
    if (!pageCode) {
      if (!silent) window.open(KOS.BASE, '_self');
      return;
    }

    const loadIframe = (url) => new Promise((resolve, reject) => {
      const frame = document.createElement('iframe');
      frame.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;left:-9999px;top:-9999px;';
      document.body.appendChild(frame);
      frame.onload = () => resolve(frame);
      setTimeout(() => { frame.remove(); reject(new Error('timeout: ' + url)); }, 20000);
      frame.src = url;
    });

    const getPC = (doc, fallback) => {
      let pc = fallback;
      doc.querySelectorAll('script').forEach(s => {
        const m = s.textContent.match(/pageCode\s*=\s*'([a-f0-9]+)'/);
        if (m) pc = m[1];
      });
      return pc;
    };

    let overlay = null;
    if (!silent) {
      overlay = this.createArchiveOverlay(1);
      if (overlay) this.updateArchiveOverlay(overlay, 0, 1, 'Načítám předměty...');
      document.body.appendChild(overlay);
    }

    try {
      // ── Step 1: Collect items to archive from subjects.do AND moduls.do ──
      const items = []; // { code, name, detailId }
      let semesterId = '';
      let currentPageCode = pageCode;

      // 1a. Subjects
      const subjFrame = await loadIframe(`subjects.do?page=${pageCode}`);
      const subjDoc = subjFrame.contentDocument;
      if (subjDoc) {
        const sel = subjDoc.querySelector('select[name="selSemester"]');
        if (sel) semesterId = sel.value;
        currentPageCode = getPC(subjDoc, pageCode);

        subjDoc.querySelectorAll('tr.tableRow1, tr.tableRow2').forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length < 5) return;
          const code = cells[0].textContent.trim();
          if (!code || code.length < 3) return;
          const name = cells[1]?.textContent.trim().split('\n')[0].trim() || code;
          const detailId = Homepage.extractDetailId(row);
          if (detailId) items.push({ code, name, detailId });
        });

        // Also build a global code→detailId map from ALL links on subjects.do
        // This catches modules and items in non-standard table positions
        subjDoc.querySelectorAll('a').forEach(link => {
          const onclick = link.getAttribute('onclick') || '';
          const href = link.getAttribute('href') || '';
          for (const text of [onclick, href]) {
            const m = text.match(/showSubjectDetail\(\s*'?(\d+)/);
            if (m) {
              const code = link.textContent.trim();
              const id = m[1];
              if (code && code.length >= 3 && !items.find(i => i.code === code)) {
                items.push({ code, name: code, detailId: id });
                console.log('[KOS] Extra subject from link scan:', code, '→', id);
              }
            }
          }
        });
      }
      subjFrame.remove();

      // 1b. Modules — load moduls.do, find module codes + try to find detailIds
      if (overlay) this.updateArchiveOverlay(overlay, 0, 1, 'Načítám moduly...');
      const modFrame = await loadIframe(`moduls.do?page=${currentPageCode}`);
      const modDoc = modFrame.contentDocument;
      const moduleCodes = []; // { code, name } — codes we need to archive
      if (modDoc) {
        currentPageCode = getPC(modDoc, currentPageCode);
        const archivedCodes = new Set(items.map(i => i.code));

        // Collect all module codes from header rows
        // Only archive enrolled modules (seznamPrZapsane), not available ones (seznamPr)
        for (const table of [modDoc.getElementById('seznamPrZapsane')]) {
          if (!table) continue;
          for (const row of table.querySelectorAll('tr')) {
            const hCells = row.querySelectorAll('td.tableHeader');
            if (hCells.length < 2) continue;
            const codeEl = hCells[0].querySelector('b');
            const nameEl = hCells[1].querySelector('b');
            if (!codeEl || !nameEl) continue;
            const code = codeEl.textContent.trim();
            const name = nameEl.textContent.trim();
            if (!code || archivedCodes.has(code)) continue;

            // Try extractDetailId from header row first
            let detailId = Homepage.extractDetailId(row);

            // Also scan next sibling rows (data rows) for links
            if (!detailId) {
              let sibling = row.nextElementSibling;
              for (let i = 0; i < 5 && sibling; i++) {
                if (sibling.querySelector('td.tableHeader b')) break; // next module
                detailId = Homepage.extractDetailId(sibling);
                if (detailId) break;
                sibling = sibling.nextElementSibling;
              }
            }

            if (detailId) {
              items.push({ code, name, detailId });
              archivedCodes.add(code);
            } else {
              moduleCodes.push({ code, name });
              console.log('[KOS] Module without detailId on moduls.do:', code, name);
            }
          }
        }

        // Scan full page HTML for showSubjectDetail patterns near module codes
        if (moduleCodes.length > 0) {
          const html = modDoc.body.innerHTML;

          // Strategy A: Search for showSubjectDetail near module codes (wide range)
          for (const mod of [...moduleCodes]) {
            const codeEsc = mod.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Search with wider range (1000 chars)
            const re = new RegExp(`showSubjectDetail\\(\\s*'?(\\d+)[^)]*\\)[\\s\\S]{0,1000}${codeEsc}|${codeEsc}[\\s\\S]{0,1000}showSubjectDetail\\(\\s*'?(\\d+)`, 'i');
            const m = html.match(re);
            if (m) {
              const id = m[1] || m[2];
              items.push({ code: mod.code, name: mod.name, detailId: id });
              moduleCodes.splice(moduleCodes.indexOf(mod), 1);
            }
          }

          // Strategy B: Find links wrapping the module name text
          if (moduleCodes.length > 0) {
            modDoc.querySelectorAll('a').forEach(a => {
              const text = a.textContent.trim();
              const onclick = a.getAttribute('onclick') || '';
              const href = a.getAttribute('href') || '';
              for (const mod of [...moduleCodes]) {
                if (text.includes(mod.code) || text.includes(mod.name)) {
                  const id = (onclick.match(/showSubjectDetail\(\s*'?(\d+)/) ||
                              href.match(/showSubjectDetail\(\s*'?(\d+)/) ||
                              onclick.match(/\(\s*(\d{2,})\s*[,)]/) ||
                              href.match(/subjectId=(\d+)/) || [])[1];
                  if (id) {
                    items.push({ code: mod.code, name: mod.name, detailId: id });
                    moduleCodes.splice(moduleCodes.indexOf(mod), 1);
                    console.log('[KOS] Found module via link text:', mod.code, '→', id);
                  }
                }
              }
            });
          }
        }
      }
      modFrame.remove();

      // 1c. For remaining module codes without detailId, search subjects.do
      if (moduleCodes.length > 0) {
        if (overlay) this.updateArchiveOverlay(overlay, 0, 1, 'Hledám moduly v předmětech...');
        const subj2Frame = await loadIframe(`subjects.do?page=${currentPageCode}`);
        const subj2Doc = subj2Frame.contentDocument;
        if (subj2Doc) {
          currentPageCode = getPC(subj2Doc, currentPageCode);
          const html = subj2Doc.body.innerHTML;
          for (const mod of [...moduleCodes]) {
            // Find the module code on subjects.do page and get its detailId
            const re = new RegExp(`showSubjectDetail\\(\\s*'?(\\d+)[^)]*\\)[^<]{0,500}${mod.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|${mod.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^<]{0,500}showSubjectDetail\\(\\s*'?(\\d+)`, 'i');
            const m = html.match(re);
            if (m) {
              const id = m[1] || m[2];
              items.push({ code: mod.code, name: mod.name, detailId: id });
              moduleCodes.splice(moduleCodes.indexOf(mod), 1);
              console.log('[KOS] Found module on subjects.do:', mod.code, '→', id);
            }
          }
          // Also try broader: search ALL links for the code text
          for (const mod of [...moduleCodes]) {
            subj2Doc.querySelectorAll('a').forEach(link => {
              if (link.textContent.trim() === mod.code) {
                const id = Homepage.extractDetailId(link.closest('tr') || link.parentElement);
                if (id) {
                  items.push({ code: mod.code, name: mod.name, detailId: id });
                  moduleCodes.splice(moduleCodes.indexOf(mod), 1);
                }
              }
            });
          }
        }
        subj2Frame.remove();
      }

      // 1d. For remaining modules, click their links directly in moduls.do iframe
      if (moduleCodes.length > 0) {
        if (overlay) this.updateArchiveOverlay(overlay, 0, 1, 'Archivuji moduly přímým kliknutím...');
        const modFrame2 = await loadIframe(`moduls.do?page=${currentPageCode}`);
        const modDoc2 = modFrame2.contentDocument;
        if (modDoc2) {
          currentPageCode = getPC(modDoc2, currentPageCode);
          const archive = await SyllabusArchive.getArchive();
          for (const mod of [...moduleCodes]) {
            try {
              // Find the module code in the page and get a clickable link to its detail
              let link = null;
              // Strategy 1: bold code text in tableHeader, check parent <a> or row links
              const boldEls = modDoc2.querySelectorAll('td.tableHeader b');
              for (const b of boldEls) {
                if (b.textContent.trim() === mod.code) {
                  // Check if bold itself is inside a link
                  const parentLink = b.closest('a');
                  if (parentLink) { link = parentLink; break; }
                  // Check the row for any link
                  const row = b.closest('tr');
                  if (row) {
                    link = row.querySelector('a[onclick]') ||
                           row.querySelector('a[href*="javascript"]') ||
                           row.querySelector('a[href*="subjectDetail"]') ||
                           row.querySelector('a');
                  }
                  // Also check the next few sibling rows
                  if (!link && row) {
                    let sibling = row.nextElementSibling;
                    for (let si = 0; si < 3 && sibling && !link; si++) {
                      if (sibling.querySelector('td.tableHeader b')) break;
                      link = sibling.querySelector('a[onclick]') ||
                             sibling.querySelector('a[href*="javascript"]') ||
                             sibling.querySelector('a');
                      sibling = sibling.nextElementSibling;
                    }
                  }
                  break;
                }
              }
              // Strategy 2: search all links for the module code text
              if (!link) {
                modDoc2.querySelectorAll('a').forEach(a => {
                  if (!link && a.textContent.trim() === mod.code) link = a;
                });
              }
              // Strategy 3: search all links for showSubjectDetail near the code
              if (!link) {
                const html = modDoc2.body.innerHTML;
                const codeEsc = mod.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const re = new RegExp(codeEsc + '[\\s\\S]{0,500}showSubjectDetail\\(\\s*\'?(\\d+)', 'i');
                const match = html.match(re);
                if (match) {
                  // Found a detailId — add to items directly instead of clicking
                  items.push({ code: mod.code, name: mod.name, detailId: match[1] });
                  moduleCodes.splice(moduleCodes.indexOf(mod), 1);
                  console.log('[KOS] Found module detailId via HTML scan:', mod.code, '→', match[1]);
                  continue;
                }
              }
              if (!link) {
                console.warn('[KOS] No clickable link for module:', mod.code);
                continue;
              }
              // Click the link — this triggers KOS's internal form submission
              link.click();
              // Wait for the iframe to navigate to the detail page
              await new Promise((resolve, reject) => {
                modFrame2.onload = resolve;
                setTimeout(resolve, 5000); // timeout fallback
              });
              await new Promise(r => setTimeout(r, 500));
              const detailDoc = modFrame2.contentDocument;
              if (detailDoc) {
                const data = SyllabusArchive.extractFromDocument(detailDoc);
                if (data && data.code) {
                  archive[data.code] = data;
                  console.log('[KOS] Archived module via click:', mod.code, '→', data.code);
                  moduleCodes.splice(moduleCodes.indexOf(mod), 1);
                } else {
                  console.warn('[KOS] Click archive: no data for', mod.code);
                }
              }
              // Navigate back to moduls.do for the next module
              modFrame2.src = `moduls.do?page=${currentPageCode}`;
              await new Promise((resolve) => {
                modFrame2.onload = resolve;
                setTimeout(resolve, 8000);
              });
            } catch (err) {
              console.warn('[KOS] Module click-archive failed:', mod.code, err);
            }
          }
          await SyllabusArchive.setArchive(archive);
        }
        modFrame2.remove();
        if (moduleCodes.length > 0) {
          console.warn('[KOS] Modules still not archived:', moduleCodes.map(m => m.code));
        }
      }

      if (!semesterId) { if (!silent) alert('Nepodařilo se zjistit semestr.'); if (overlay) overlay.remove(); return; }
      if (items.length === 0) { if (!silent) alert('Nepodařilo se najít žádné předměty/moduly s detail ID.'); if (overlay) overlay.remove(); return; }

      console.log(`[KOS] Found ${items.length} items to archive:`, items.map(s => `${s.code}=${s.detailId}`));

      // ── Step 2: Archive each item via form POST into iframe ──
      if (overlay) this.updateArchiveOverlay(overlay, 0, items.length, 'Archivuji...');

      const archiveFrame = document.createElement('iframe');
      archiveFrame.name = 'kos-archive-frame';
      archiveFrame.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;left:-9999px;top:-9999px;';
      document.body.appendChild(archiveFrame);

      const form = document.createElement('form');
      form.method = 'POST';
      form.target = 'kos-archive-frame';
      const fSubjectId = document.createElement('input');
      fSubjectId.type = 'hidden'; fSubjectId.name = 'subjectId';
      const fSemesterId = document.createElement('input');
      fSemesterId.type = 'hidden'; fSemesterId.name = 'semesterId'; fSemesterId.value = semesterId;
      form.appendChild(fSubjectId);
      form.appendChild(fSemesterId);
      document.body.appendChild(form);

      let archived = 0;
      for (let i = 0; i < items.length; i++) {
        const s = items[i];
        form.action = `subjectDetail.do?page=${currentPageCode}`;
        fSubjectId.value = s.detailId;

        if (overlay) this.updateArchiveOverlay(overlay, i + 1, items.length, s.name);

        try {
          await new Promise((resolve, reject) => {
            archiveFrame.onload = resolve;
            setTimeout(() => reject(new Error('timeout')), 15000);
            form.submit();
          });

          await new Promise(r => setTimeout(r, 500));

          const iframeDoc = archiveFrame.contentDocument;
          if (iframeDoc) {
            const data = SyllabusArchive.extractFromDocument(iframeDoc);
            if (data && data.code) {
              const archive = await SyllabusArchive.getArchive();
              archive[data.code] = data;
              await SyllabusArchive.setArchive(archive);
              archived++;
            }
            currentPageCode = getPC(iframeDoc, currentPageCode);
          }
        } catch (err) {
          console.warn('[KOS] Archive failed for', s.code, err);
        }
      }

      archiveFrame.remove();
      form.remove();

      if (overlay) {
        this.updateArchiveOverlay(overlay, items.length, items.length, `Hotovo! ${archived}/${items.length} archivováno.`);
        setTimeout(() => overlay.remove(), 2000);
      }

      // Refresh archive link in footer
      const footerRow = document.querySelector('.kos-footer-row');
      if (footerRow) {
        const oldLink = footerRow.firstChild;
        const newLink = await this.createArchiveLink();
        if (oldLink) footerRow.replaceChild(newLink, oldLink);
      }

    } catch (err) {
      console.error('[KOS] archiveAllSyllabi error:', err);
      if (overlay) overlay.remove();
      if (!silent) alert('Archivace selhala: ' + err.message);
    }
  },

  createArchiveOverlay(total) {
    const overlay = KOS.el('div', { className: 'kos-archive-overlay' });
    const box = KOS.el('div', { className: 'kos-archive-progress' },
      KOS.el('div', { className: 'kos-archive-progress__title' }, 'Archivuji sylaby...'),
      KOS.el('div', { className: 'kos-archive-progress__bar-bg' },
        KOS.el('div', { className: 'kos-archive-progress__bar', style: { width: '0%' } })
      ),
      KOS.el('div', { className: 'kos-archive-progress__text' }, `0 / ${total}`)
    );
    overlay.appendChild(box);
    return overlay;
  },

  updateArchiveOverlay(overlay, current, total, label) {
    const pct = Math.round((current / total) * 100);
    const bar = overlay.querySelector('.kos-archive-progress__bar');
    const text = overlay.querySelector('.kos-archive-progress__text');
    if (bar) bar.style.width = `${pct}%`;
    if (text) text.textContent = label || `${current} / ${total}`;
  },

  /** Extract subject detailId from a table row - checks onclick, href, javascript: hrefs */
  extractDetailId(row) {
    // Check ALL links in the row, not just a[onclick]
    const allLinks = row.querySelectorAll('a');
    for (const link of allLinks) {
      const onclick = link.getAttribute('onclick') || '';
      const href = link.getAttribute('href') || '';
      // Combine both attributes for matching
      const texts = [onclick, href].filter(Boolean);
      for (const text of texts) {
        // showSubjectDetail(123) or showSubjectDetail('123')
        const m1 = text.match(/showSubjectDetail\(\s*'?(\d+)/);
        if (m1) return m1[1];
        // viewSubject(..., 123) or viewSubject(..., '123')
        const m2 = text.match(/viewSubject\([^)]*,\s*'?(\d+)/);
        if (m2) return m2[1];
        // subjectId=123
        const m3 = text.match(/subjectId=(\d+)/);
        if (m3) return m3[1];
        // Any JS function call with a numeric arg >= 2 digits
        const m4 = text.match(/\(\s*(\d{2,})\s*[,)]/);
        if (m4) return m4[1];
      }
    }
    // Also check <input> elements (buttons)
    for (const input of row.querySelectorAll('input[onclick]')) {
      const onclick = input.getAttribute('onclick') || '';
      const m = onclick.match(/\(\s*(\d{2,})\s*[,)]/);
      if (m) return m[1];
    }
    // Last resort: scan raw innerHTML for showSubjectDetail pattern
    const html = row.innerHTML;
    const m = html.match(/showSubjectDetail\(\s*'?(\d+)/);
    if (m) return m[1];
    const m2 = html.match(/subjectId[=:](\d+)/);
    if (m2) return m2[1];
    return '';
  }
};
