/**
 * KOS Upgrade – Syllabus Archiver
 * Archives syllabus content from subject detail pages into chrome.storage.
 * Runs on subjectDetail.do pages (both popup and main window).
 *
 * KOS pages have massive inline <script> blocks. textContent captures script
 * content, so we must strip scripts/styles before extracting text.
 * We parse the KOS DOM structure: collapsible sections with bold headers
 * (Obsah, Literatura, Hodnoticí metody, etc.) contain the actual content.
 */

const SyllabusArchive = {
  VERSION: 2,

  init() {
    if (!window.location.href.includes('subjectDetail.do')) return;
    this.archiveCurrentSyllabus();
  },

  async archiveCurrentSyllabus() {
    await new Promise(r => setTimeout(r, 600));

    // Get a clean copy of the page without scripts/styles
    const clean = this.getCleanContent();
    if (!clean) return;

    // Extract code and name from the detail header
    const code = this.findField(clean, /Kód\s+předmětu\s*:\s*(\S+)/i);
    const titleMatch = document.body.innerHTML.match(/Detail\s+předmětu\s*:\s*([^<]+)/i);
    const name = titleMatch ? titleMatch[1].trim() : this.findField(clean, /Název\s+předmětu\s*:\s*(.+?)(?:\n|$)/i);

    if (!code && !name) return;

    // Extract all content sections from the KOS collapsible panels
    const sections = this.extractSections();

    // Extract meta info
    const meta = {};
    const metaPatterns = {
      'Zakončení': /Způsob\s+zakončení\s*:\s*(\S+)/i,
      'Kredity': /Počet\s+kreditů\s*:\s*(\d+)/i,
      'Rozsah': /Rozsah\s*:\s*(\S+)/i,
      'Jazyk': /Jazyk\s+výuky\s*:\s*(\S+)/i,
      'Vyučující': /Vyučující\s*:\s*(.+?)(?:\n|$)/i,
    };
    for (const [key, re] of Object.entries(metaPatterns)) {
      const val = this.findField(clean, re);
      if (val) meta[key] = val;
    }

    // Build clean text
    let text = `${code} — ${name}\n`;
    for (const [k, v] of Object.entries(meta)) {
      text += `${k}: ${v}\n`;
    }
    text += '\n';
    for (const [heading, content] of Object.entries(sections)) {
      if (content.trim()) {
        text += `── ${heading} ──\n${content.trim()}\n\n`;
      }
    }

    const syllabus = {
      code, name, meta, sections,
      text: text.trim(),
      url: window.location.href,
      archivedAt: Date.now(),
      semester: this.detectSemester(),
      _v: this.VERSION
    };

    const archive = await this.getArchive();
    const key = code || name.replace(/\s+/g, '_');
    archive[key] = syllabus;
    await this.setArchive(archive);

    const badge = KOS.el('div', { className: 'kos-archive-badge' }, `Sylabus archivován: ${code}`);
    document.body.appendChild(badge);
    setTimeout(() => badge.remove(), 3000);
    console.log(`[KOS Upgrade] Archived syllabus: ${code} ${name}`, Object.keys(sections));
  },

  /** Clone #main-panel, strip scripts/styles/nav, return clean textContent */
  getCleanContent(doc = document) {
    const panel = doc.querySelector('#main-panel') || doc.body;
    const clone = panel.cloneNode(true);
    // Remove all script, style, noscript, and KOS navigation elements
    clone.querySelectorAll('script, style, noscript, link, #hlavicka, #menu, #paticka, .kos-archive-badge, .kos-week-badge').forEach(el => el.remove());
    return clone.textContent || '';
  },

  /** Extract collapsible content sections from the KOS subject detail page */
  extractSections(doc = document) {
    const sections = {};
    const sectionNames = [
      'Obsah', 'Anotace', 'Annotation', 'Cíl předmětu',
      'Výsledky učení', 'Předpoklady a další požadavky',
      'Literatura', 'Literature',
      'Hodnoticí metody a kritéria', 'Způsob hodnocení',
      'Poznámka', 'Webová stránka', 'Doplňující text',
      'Sylabus', 'Syllabus', 'Komentář učitele'
    ];

    const getCleanText = (el) => {
      if (!el) return '';
      const clone = el.cloneNode(true);
      clone.querySelectorAll('script, style, noscript').forEach(n => n.remove());
      // Collapse excessive whitespace/tabs but preserve paragraph breaks
      return clone.textContent
        .replace(/[\t ]+/g, ' ')        // tabs and spaces → single space
        .replace(/\n\s*\n/g, '\n\n')    // multiple blank lines → one blank line
        .replace(/\n /g, '\n')           // leading spaces on lines
        .trim();
    };

    const isValidContent = (text) => {
      return text && text.length > 3 &&
        !text.startsWith('var ') && !text.startsWith('function ') &&
        !text.includes('setAction(') && !text.includes('isVisible');
    };

    // Strategy 1: Find bold/strong elements that match section names
    const boldEls = doc.querySelectorAll('#main-panel b, #main-panel strong, body b, body strong');
    for (const b of boldEls) {
      const heading = b.textContent.trim();
      const matched = sectionNames.find(s => heading.includes(s));
      if (!matched || sections[matched]) continue;

      // Try multiple content locations in order of likelihood
      const candidates = [];

      // a) Same cell — content after the bold element (b is inline, text follows)
      const parentCell = b.closest('td');
      if (parentCell) {
        // Check if there's text content AFTER the bold in the same cell
        const cellClone = parentCell.cloneNode(true);
        cellClone.querySelectorAll('script, style, noscript').forEach(n => n.remove());
        const boldInClone = cellClone.querySelector('b, strong');
        if (boldInClone) boldInClone.remove();
        const remaining = cellClone.textContent.trim();
        if (remaining.length > 10) candidates.push(remaining);
      }

      // b) Next sibling cell in the same row
      if (parentCell && parentCell.nextElementSibling) {
        candidates.push(getCleanText(parentCell.nextElementSibling));
      }

      // c) Next row's cells
      const row = b.closest('tr');
      if (row && row.nextElementSibling) {
        const nextRow = row.nextElementSibling;
        // Try all cells in the next row
        const nextCells = nextRow.querySelectorAll('td');
        for (const cell of nextCells) {
          candidates.push(getCleanText(cell));
        }
        // Also try the whole next row
        candidates.push(getCleanText(nextRow));
      }

      // d) Next sibling of parent div/td
      const container = b.closest('td') || b.closest('div') || b.parentElement;
      if (container) {
        let sibling = container.nextElementSibling;
        // Walk up to 3 siblings
        for (let i = 0; i < 3 && sibling; i++) {
          candidates.push(getCleanText(sibling));
          sibling = sibling.nextElementSibling;
        }
      }

      // e) Parent's next sibling
      if (container && container.parentElement) {
        const parentSibling = container.parentElement.nextElementSibling;
        if (parentSibling) candidates.push(getCleanText(parentSibling));
      }

      // Pick the best candidate (longest valid text, but not too similar to the heading)
      for (let text of candidates) {
        if (!isValidContent(text) || text === heading) continue;
        // Strip leading heading text if duplicated in content
        const headingRe = new RegExp('^\\s*' + matched.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*', 'i');
        text = text.replace(headingRe, '').trim();
        if (text.length > (sections[matched] || '').length) {
          sections[matched] = text;
          break;
        }
      }
    }

    // Strategy 2: Parse all table rows looking for label-value pairs
    // KOS sometimes uses: <tr><td><b>Label</b></td><td>Content</td></tr>
    if (Object.keys(sections).length < 3) {
      const allRows = doc.querySelectorAll('#main-panel tr, body tr');
      for (const row of allRows) {
        const cells = row.querySelectorAll('td');
        if (cells.length < 2) continue;
        const label = cells[0].textContent.trim();
        const matched = sectionNames.find(s => label.includes(s));
        if (!matched || sections[matched]) continue;
        const text = getCleanText(cells[1]);
        if (isValidContent(text)) sections[matched] = text;
      }
    }

    return sections;
  },

  findField(text, regex) {
    const m = text.match(regex);
    return m ? m[1].trim() : '';
  },

  detectSemester() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    // Sept-Jan = winter (ZS), Feb-Aug = summer (LS)
    if (month >= 9) return `ZS ${year}/${year + 1}`;
    if (month <= 1) return `ZS ${year - 1}/${year}`;
    return `LS ${year - 1}/${year}`;
  },

  /** Extract syllabus data from any document (for headless iframe archiving) */
  extractFromDocument(doc) {
    const clean = this.getCleanContent(doc);
    if (!clean) return null;

    const code = this.findField(clean, /Kód\s+předmětu\s*:\s*(\S+)/i);
    const titleMatch = doc.body.innerHTML.match(/Detail\s+předmětu\s*:\s*([^<]+)/i);
    const name = titleMatch ? titleMatch[1].trim() : this.findField(clean, /Název\s+předmětu\s*:\s*(.+?)(?:\n|$)/i);

    if (!code && !name) return null;

    const sections = this.extractSections(doc);
    const meta = {};
    const metaPatterns = {
      'Zakončení': /Způsob\s+zakončení\s*:\s*(\S+)/i,
      'Kredity': /Počet\s+kreditů\s*:\s*(\d+)/i,
      'Rozsah': /Rozsah\s*:\s*(\S+)/i,
      'Jazyk': /Jazyk\s+výuky\s*:\s*(\S+)/i,
      'Vyučující': /Vyučující\s*:\s*(.+?)(?:\n|$)/i,
    };
    for (const [key, re] of Object.entries(metaPatterns)) {
      const val = this.findField(clean, re);
      if (val) meta[key] = val;
    }

    let text = `${code} — ${name}\n`;
    for (const [k, v] of Object.entries(meta)) text += `${k}: ${v}\n`;
    text += '\n';
    for (const [heading, content] of Object.entries(sections)) {
      if (content.trim()) text += `── ${heading} ──\n${content.trim()}\n\n`;
    }

    return {
      code, name, meta, sections,
      text: text.trim(),
      url: '',
      archivedAt: Date.now(),
      semester: this.detectSemester(),
      _v: this.VERSION
    };
  },

  getArchive() {
    return new Promise(resolve => {
      if (!KOS.isContextValid()) { resolve({}); return; }
      try {
        chrome.storage.local.get('syllabus_archive', result => {
          if (chrome.runtime.lastError) { resolve({}); return; }
          resolve(result.syllabus_archive || {});
        });
      } catch (e) { resolve({}); }
    });
  },

  setArchive(archive) {
    return new Promise(resolve => {
      if (!KOS.isContextValid()) { resolve(); return; }
      try {
        chrome.storage.local.set({ syllabus_archive: archive }, resolve);
      } catch (e) { resolve(); }
    });
  },

  async getArchiveCount() {
    const archive = await this.getArchive();
    return Object.keys(archive).length;
  },

  async exportArchive() {
    const archive = await this.getArchive();

    // Filter to only include enrolled subjects and modules
    const subjects = await KOS.getCache('subjects');
    const modules = await KOS.getCache('modules');
    const enrolledCodes = new Set();
    if (subjects && subjects.data) subjects.data.forEach(s => enrolledCodes.add(s.code));
    if (modules && modules.data) {
      (modules.data.enrolled || []).forEach(m => enrolledCodes.add(m.code));
    }

    // If we have enrollment data, filter; otherwise export all (fallback)
    let keys;
    if (enrolledCodes.size > 0) {
      keys = Object.keys(archive).filter(key => {
        const entry = archive[key];
        return enrolledCodes.has(key) || enrolledCodes.has(entry.code);
      });
    } else {
      keys = Object.keys(archive);
    }

    if (keys.length === 0) {
      alert('Archiv je prazdny. Navstiv detail predmetu pro archivaci.');
      return;
    }

    // Build human-readable HTML
    const semester = this.detectSemester();
    let html = `<!DOCTYPE html>
<html lang="cs"><head><meta charset="utf-8">
<title>Archiv sylabu — ${semester}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 900px; margin: 20px auto; padding: 0 20px; color: #333; }
  h1 { color: #01747b; border-bottom: 2px solid #01747b; padding-bottom: 8px; }
  h2 { color: #01747b; margin-top: 30px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  .meta { font-size: 13px; color: #888; margin-bottom: 20px; }
  .subject { margin-bottom: 30px; page-break-inside: avoid; }
  .subject-header { display: flex; gap: 12px; align-items: baseline; margin-bottom: 8px; }
  .subject-code { font-weight: 700; color: #01747b; font-size: 14px; margin-right: 8px; }
  .subject-meta { font-size: 13px; color: #666; margin-bottom: 12px; line-height: 1.8; }
  h3 { font-size: 14px; color: #333; margin: 16px 0 6px; }
  .content { font-size: 14px; line-height: 1.6; white-space: pre-wrap; background: #f8f8f8; padding: 12px; border-left: 3px solid #01747b; margin-bottom: 8px; }
  .archived { font-size: 11px; color: #bbb; margin-top: 8px; border-top: 1px solid #eee; padding-top: 4px; }
</style></head><body>
<h1>Archiv sylabu</h1>
<div class="meta">${semester} — exportovano ${new Date().toLocaleDateString('cs-CZ')} — ${keys.length} predmetu</div>\n`;

    // Sort by code
    const sorted = keys.sort((a, b) => a.localeCompare(b));
    for (const key of sorted) {
      const s = archive[key];
      const date = new Date(s.archivedAt).toLocaleDateString('cs-CZ');
      const esc = (t) => (t || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      // Skip entries with corrupted data (old version with JS code)
      if (s._v !== this.VERSION && s.text && (s.text.includes('var isVisible') || s.text.includes('function setAction'))) {
        html += `<div class="subject">\n`;
        html += `  <h2><span class="subject-code">${esc(s.code)}</span> ${esc(s.name || key)}</h2>\n`;
        html += `  <div class="content" style="color:#c00">Zastaralý archiv — otevři detail tohoto předmětu v KOS pro novou archivaci.</div>\n`;
        html += `</div>\n`;
        continue;
      }

      html += `<div class="subject">\n`;
      html += `  <h2><span class="subject-code">${esc(s.code)}</span> ${esc(s.name || key)}</h2>\n`;

      // Meta line
      if (s.meta && Object.keys(s.meta).length > 0) {
        const metaHtml = Object.entries(s.meta).map(([k, v]) => `<b>${esc(k)}:</b> ${esc(v)}`).join(' · ');
        html += `  <div class="subject-meta">${metaHtml}</div>\n`;
      }

      // Content sections
      if (s.sections && Object.keys(s.sections).length > 0) {
        for (const [heading, content] of Object.entries(s.sections)) {
          html += `  <h3>${esc(heading)}</h3>\n  <div class="content">${esc(content)}</div>\n`;
        }
      } else if (s.text && !s.text.includes('var isVisible')) {
        html += `  <div class="content">${esc(s.text)}</div>\n`;
      }

      html += `  <div class="archived">Archivováno: ${date}${s.semester ? ' — ' + s.semester : ''}</div>\n`;
      html += `</div>\n`;
    }

    html += '</body></html>';

    const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kos-sylabus-archiv-${semester.replace(/\s+/g, '-').replace(/\//g, '-')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
};
