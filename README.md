# KOS Upgrade – FAMU Edition

Chrome/Safari extension that enhances the [KOS (AMU)](https://kos.amu.cz) student information system with a modern dashboard, schedule grid, syllabus archiving, and more.

## Features

- **Dashboard homepage** with mini schedule grid, subjects, and modules
- **Countdown timer** showing current/next class
- **Syllabus archiving** — bulk-download all syllabi for offline access
- **Module monitoring** — detects new modules and highlights ones matching your interests (analog film, AI)
- **Auto-refresh** — silently refreshes data in the background on page load
- **Week parity** indicator (lichý/sudý)
- **Collision support** — correctly displays subjects in time-slot collisions
- **Hide/unhide** individual schedule entries per day

## Installation

### Chrome
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select this folder

### Safari
See the `kos-safari/` sibling project for the Safari Web Extension wrapper.

## Structure

```
src/
  main.js            — Entry point, cache versioning
  utils.js           — Shared utilities (KOS object)
  homepage.js        — Dashboard, schedule grid, countdown, archiving
  schedule.js        — Schedule page enhancements + caching
  subjects.js        — Subjects/modules page enhancements + caching
  syllabusArchive.js — Syllabus extraction and storage
  weekParity.js      — Week parity badge
  styles.css         — All extension styles
manifest.json        — Chrome extension manifest
icons/               — Extension icons
```
