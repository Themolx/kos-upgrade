/**
 * KOS Upgrade – FAMU Edition
 * Entry point.
 *
 * Security: This extension only reads/modifies the DOM of the user's
 * own authenticated KOS session. No data is sent externally.
 */

(function () {
  'use strict';

  const CACHE_VERSION = 7;

  const isLoggedIn = document.querySelector('a[href*="logout"]') ||
                     document.querySelector('a[onclick*="logout"]');
  if (!isLoggedIn) return;

  // Version-based cache invalidation: clear stale schedule/subjects/modules
  // but KEEP syllabus_archive (takes effort to rebuild)
  chrome.storage.local.get('cache_version', result => {
    if (result.cache_version !== CACHE_VERSION) {
      console.log(`[KOS Upgrade] Cache version changed (${result.cache_version} → ${CACHE_VERSION}), clearing stale data...`);
      chrome.storage.local.remove([
        'subjects', 'schedule', 'modules',
        'schedule_overrides'
      ], () => {
        chrome.storage.local.set({ cache_version: CACHE_VERSION });
        console.log('[KOS Upgrade] Stale cache cleared. Click "Obnovit data" to rebuild.');
      });
    }
  });

  console.log('[KOS Upgrade] Initializing...');

  // Inject global nav bar on every page (except logout)
  if (!window.location.href.includes('logout.do')) {
    try {
      const navLinks = [
        { label: 'Rozvrh', endpoint: 'studentMinutesSchedule.do' },
        { label: 'Předměty', endpoint: 'subjects.do' },
        { label: 'Moduly', endpoint: 'moduls.do' },
        { label: 'Výsledky', endpoint: 'results.do' },
        { label: 'Termíny zkoušek', endpoint: 'examsTerms.do' },
        { label: 'Přihlášené zkoušky', endpoint: 'examsView.do' },
        { label: 'Zápis dle kódu', endpoint: 'subjectsCode.do' },
        { label: 'Zápis dle plánu', endpoint: 'structuredSubjectsPlan.do' },
        { label: 'Osobní údaje', endpoint: 'studentDetail.do' },
      ];
      const nav = KOS.el('div', { className: 'kos-nav-compact kos-nav-global' });
      for (const link of navLinks) {
        nav.appendChild(KOS.el('a', {
          className: 'kos-nav-compact__link', href: '#',
          onClick(e) { e.preventDefault(); KOS.navigate(link.endpoint); }
        }, link.label));
      }
      // Also add Home link (back to welcome) on non-home pages
      const url = window.location.href;
      const nonHomePages = ['subjects.do', 'moduls.do', 'studentMinutesSchedule.do',
        'subjectDetail.do', 'results.do', 'examsTerms.do', 'examsView.do',
        'subjectsCode.do', 'structuredSubjectsPlan.do', 'studentDetail.do',
        'minutesSchedule.do'];
      if (nonHomePages.some(p => url.includes(p))) {
        const homeLink = KOS.el('a', {
          className: 'kos-nav-compact__link kos-nav-compact__link--home', href: '#',
          onClick(e) { e.preventDefault(); KOS.navigate('toWelcome.do'); }
        }, '← Domů');
        nav.insertBefore(homeLink, nav.firstChild);
      }
      const mainPanel = document.getElementById('main-panel');
      if (mainPanel) mainPanel.insertBefore(nav, mainPanel.firstChild);
    } catch (e) { console.error('[KOS Upgrade] NavBar:', e); }
  }

  try { WeekParity.init(); } catch (e) { console.error('[KOS Upgrade] WeekParity:', e); }
  try { Schedule.init(); } catch (e) { console.error('[KOS Upgrade] Schedule:', e); }
  try { ScheduleEdit.init(); } catch (e) { console.error('[KOS Upgrade] ScheduleEdit:', e); }
  try { Homepage.init(); } catch (e) { console.error('[KOS Upgrade] Homepage:', e); }
  try { Subjects.init(); } catch (e) { console.error('[KOS Upgrade] Subjects:', e); }
  try { SyllabusArchive.init(); } catch (e) { console.error('[KOS Upgrade] SyllabusArchive:', e); }

  console.log('[KOS Upgrade] Ready.');
})();
