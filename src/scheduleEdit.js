/**
 * KOS Upgrade – Schedule Editor
 * Allows overriding schedule entries when the system is wrong.
 * Stores overrides in chrome.storage.local under 'schedule_overrides'.
 */

const ScheduleEdit = {
  init() {
    if (!window.location.href.includes('studentMinutesSchedule.do')) return;
    this.waitForSchedule(() => this.addEditButtons());
  },

  waitForSchedule(callback, n = 0) {
    const r = document.getElementById('rozvrh');
    if (r && r.children.length > 5) { callback(); return; }
    if (n < 30) setTimeout(() => this.waitForSchedule(callback, n + 1), 300);
  },

  addEditButtons() {
    // Add edit toggle button to page
    const toolbar = KOS.el('div', { className: 'kos-edit-toolbar' },
      KOS.el('button', {
        className: 'kos-edit-btn',
        onClick: () => this.toggleEditMode()
      }, 'Upravit rozvrh'),
      KOS.el('button', {
        className: 'kos-edit-btn kos-edit-btn--add',
        onClick: () => this.showAddDialog()
      }, '+ Pridat hodinu')
    );

    const rozvrh = document.getElementById('rozvrh');
    if (rozvrh && rozvrh.parentNode) {
      rozvrh.parentNode.insertBefore(toolbar, rozvrh);
    }

    // Apply stored overrides
    this.applyOverrides();
  },

  async toggleEditMode() {
    const rozvrh = document.getElementById('rozvrh');
    if (!rozvrh) return;

    const isEditing = rozvrh.classList.toggle('kos-edit-mode');

    if (isEditing) {
      // Add click-to-edit on each listek (but NOT detaillistek)
      const rozvrhEl = document.getElementById('rozvrh');
      if (!rozvrhEl) return;
      rozvrhEl.querySelectorAll('div[id^="listek"]').forEach(listek => {
        // Skip detaillistek divs
        if (listek.id.startsWith('detaillistek')) return;
        if (listek.querySelector('.kos-edit-overlay')) return;
        const overlay = KOS.el('div', {
          className: 'kos-edit-overlay',
          onClick: (ev) => {
            ev.stopPropagation();
            this.showEditDialog(listek);
          }
        }, 'Upravit');
        listek.appendChild(overlay);
      });
    } else {
      document.querySelectorAll('.kos-edit-overlay').forEach(el => el.remove());
    }
  },

  showEditDialog(listek) {
    const id = listek.id.replace('listek', '');
    const detail = document.getElementById('detaillistek' + id);
    if (!detail) return;

    const text = detail.textContent;
    const code = (text.match(/Kód\s+předmětu\s*:\s*(\S+)/i) || [])[1] || '';
    const name = (text.match(/Název\s+předmětu\s*:\s*(.+?)(?:\s{2,}|\n|Týden|Kód|Čas|Místnost)/i) || [])[1]?.trim() || '';
    const time = (text.match(/Čas\s+výuky\s*:\s*(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})/i) || [])[1] || '';
    const room = (text.match(/Místnost\s*:\s*(\S+)/i) || [])[1] || '';

    this.showOverrideForm({
      id, code, name, time, room,
      isNew: false,
      onSave: (data) => this.saveOverride(id, data),
      onHide: () => this.hideEntry(id),
    });
  },

  showAddDialog() {
    const id = 'custom_' + Date.now();
    this.showOverrideForm({
      id, code: '', name: '', time: '', room: '',
      day: 0, isNew: true,
      onSave: (data) => this.saveOverride(id, data),
    });
  },

  showOverrideForm(opts) {
    // Remove existing dialog
    document.querySelectorAll('.kos-edit-dialog').forEach(el => el.remove());

    const DAYS = ['Pondeli', 'Utery', 'Streda', 'Ctvrtek', 'Patek'];

    const dialog = KOS.el('div', { className: 'kos-edit-dialog' });

    const title = opts.isNew ? 'Pridat hodinu' : `Upravit: ${opts.code}`;
    dialog.appendChild(KOS.el('div', { className: 'kos-edit-dialog__title' }, title));

    const form = KOS.el('div', { className: 'kos-edit-dialog__form' });

    if (opts.isNew) {
      const daySelect = KOS.el('select', { className: 'kos-edit-input', id: 'kos-edit-day' });
      DAYS.forEach((d, i) => daySelect.appendChild(KOS.el('option', { value: String(i) }, d)));
      form.appendChild(KOS.el('label', {}, 'Den:'));
      form.appendChild(daySelect);
    }

    const fields = [
      { label: 'Kod', key: 'code', value: opts.code },
      { label: 'Nazev', key: 'name', value: opts.name },
      { label: 'Cas (napr. 10:00 - 12:30)', key: 'time', value: opts.time },
      { label: 'Mistnost', key: 'room', value: opts.room },
    ];

    for (const f of fields) {
      form.appendChild(KOS.el('label', {}, f.label + ':'));
      form.appendChild(KOS.el('input', {
        className: 'kos-edit-input',
        id: `kos-edit-${f.key}`,
        value: f.value,
        placeholder: f.label
      }));
    }

    dialog.appendChild(form);

    const buttons = KOS.el('div', { className: 'kos-edit-dialog__buttons' });

    buttons.appendChild(KOS.el('button', {
      className: 'kos-edit-btn kos-edit-btn--save',
      onClick: () => {
        const data = {
          code: document.getElementById('kos-edit-code').value,
          name: document.getElementById('kos-edit-name').value,
          time: document.getElementById('kos-edit-time').value,
          room: document.getElementById('kos-edit-room').value,
        };
        if (opts.isNew) {
          data.day = parseInt(document.getElementById('kos-edit-day').value);
        }
        opts.onSave(data);
        dialog.remove();
      }
    }, 'Ulozit'));

    if (!opts.isNew && opts.onHide) {
      buttons.appendChild(KOS.el('button', {
        className: 'kos-edit-btn kos-edit-btn--hide',
        onClick: () => { opts.onHide(); dialog.remove(); }
      }, 'Skryt hodinu'));
    }

    buttons.appendChild(KOS.el('button', {
      className: 'kos-edit-btn',
      onClick: () => dialog.remove()
    }, 'Zrusit'));

    dialog.appendChild(buttons);
    document.body.appendChild(dialog);
  },

  async saveOverride(id, data) {
    const overrides = await this.getOverrides();
    overrides[id] = { ...data, hidden: false };
    await this.setOverrides(overrides);
    this.applyOverrides();
    // Re-cache so homepage picks up changes
    Schedule.cacheData();
  },

  async hideEntry(id) {
    // Get the code so we can filter it from cache too
    const detail = document.getElementById('detaillistek' + id);
    const text = detail ? detail.textContent : '';
    const code = (text.match(/Kód\s+předmětu\s*:\s*(\S+)/i) || [])[1] || '';

    const overrides = await this.getOverrides();
    overrides[id] = { hidden: true, code };
    await this.setOverrides(overrides);
    this.applyOverrides();
    Schedule.cacheData();
  },

  async applyOverrides() {
    const overrides = await this.getOverrides();
    for (const [id, data] of Object.entries(overrides)) {
      if (id.startsWith('custom_')) continue; // custom entries handled separately
      const listek = document.querySelector(`div[id="listek${id}"]`);
      if (!listek) continue;

      if (data.hidden) {
        listek.style.display = 'none';
        continue;
      }

      // Update the visual display
      const detail = document.getElementById('detaillistek' + id);
      if (detail && data.name) {
        // Update tooltip
        listek.title = `${data.code} — ${data.name}\n${data.time} · ${data.room}`;
      }
    }
  },

  getOverrides() {
    return new Promise(resolve => {
      chrome.storage.local.get('schedule_overrides', result => {
        resolve(result.schedule_overrides || {});
      });
    });
  },

  setOverrides(overrides) {
    return new Promise(resolve => {
      chrome.storage.local.set({ schedule_overrides: overrides }, resolve);
    });
  }
};
