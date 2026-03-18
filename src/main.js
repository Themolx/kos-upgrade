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

  try { WeekParity.init(); } catch (e) { console.error('[KOS Upgrade] WeekParity:', e); }
  try { Schedule.init(); } catch (e) { console.error('[KOS Upgrade] Schedule:', e); }
  try { ScheduleEdit.init(); } catch (e) { console.error('[KOS Upgrade] ScheduleEdit:', e); }
  try { Homepage.init(); } catch (e) { console.error('[KOS Upgrade] Homepage:', e); }
  try { Subjects.init(); } catch (e) { console.error('[KOS Upgrade] Subjects:', e); }
  try { SyllabusArchive.init(); } catch (e) { console.error('[KOS Upgrade] SyllabusArchive:', e); }

  console.log('[KOS Upgrade] Ready.');
})();
