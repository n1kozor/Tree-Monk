<div align="center">

<img src="build/icon.png" alt="TreeMonk" width="120" />

# TreeMonk

**A local-first genealogy & historical-research workbench.**

Build your family tree, investigate connections on an infinite board, map your
ancestors across time, import and export GEDCOM — all **on your own
machine**, no cloud, no account, your data never leaves your computer.

[🌐 treemonk.eu](https://treemonk.eu) · [⬇️ Download](https://github.com/n1kozor/Tree-Monk/releases/latest) · [🐛 Issues](https://github.com/n1kozor/Tree-Monk/issues)

[![Website](https://img.shields.io/badge/web-treemonk.eu-2ea44f)](https://treemonk.eu)
[![Latest release](https://img.shields.io/github/v/release/n1kozor/Tree-Monk)](https://github.com/n1kozor/Tree-Monk/releases/latest)
[![License: PolyForm Noncommercial](https://img.shields.io/badge/license-PolyForm%20Noncommercial-blue)](LICENSE)
![Platforms](https://img.shields.io/badge/platform-Windows%20%C2%B7%20Linux-555)

Available in **English · Deutsch · Magyar** — auto-detected on first launch.

</div>

---

## ✨ Why TreeMonk

- **🔒 Local-first & private.** Everything is a single SQLite file on your disk.
  No cloud, no account, no telemetry — your family data stays with you.
- **🆓 Free.** Free for personal and other noncommercial use, forever
  (see [License](#-license)).
- **🌍 Multilingual.** Full English, German and Hungarian UI (auto-detected on first launch).
- **🪶 Lightweight & offline.** Works without an internet connection (map tiles
  being the obvious exception).
- **🔌 Yours to automate.** An optional, local-only **HTTP API**
  lets your own scripts — or an AI assistant you connect — read and (if you
  allow it) edit your tree. Off by default.

## ⬇️ Download

Grab the latest installer from the
**[Releases page](https://github.com/n1kozor/Tree-Monk/releases/latest)** or from
**[treemonk.eu](https://treemonk.eu)**:

- **Windows** — `TreeMonk-Setup-x.y.z.exe`
- **Linux** — `TreeMonk-x.y.z.AppImage` (or `.deb`)

The app checks for updates and tells you when a new version is available; your
data is always kept.

## 🖼️ Screenshots

A full gallery and feature tour lives on **[treemonk.eu](https://treemonk.eu)**.

## 🧩 Features

### Investigation Board
An infinite, zoomable canvas. Drag loose **notes**, **people** and **document
images** onto it and draw connections. Set whether a new link means
**Parent→Child**, **Spouse**, or **Child→Parent**, then **Merge to Tree** to
promote verified connections into the structured database.

### Family Tree
Auto-laid-out, collapsible pedigree & portrait charts. Each card shows the name,
life-span, spouse and attached-document count. Fan/pedigree layouts, printable.

### Person profiles & documents
A roomy profile page with auto-saving fields, a **timeline** of life events
(with optional world-history context), a photo gallery and a deep-zoom viewer for
reading high-resolution scans. Profile photos can be **repositioned & zoomed**.

### Period map
Plot every birth/marriage/death across a **historical** map (real period borders),
animate **migration** paths, and read nearby historical events. The map remembers
your view, selection and filters between visits.

### Overview dashboard
A full-width, tiled statistics view — demographics, surnames, given names, places,
occupations, lifespans, births vs. deaths by century — every card clickable to
drill into the people behind it, plus a multi-page **PDF export**.

### GEDCOM import & export
Import any **GEDCOM** file and export a valid GEDCOM 5.5.1 (whole tree or a
subset). Place names are standardized automatically on import.

> **FamilySearch sync** and a **Pro** edition — two-way contribution back to the
> FamilySearch tree plus advanced research tools — are in development. See
> [treemonk.eu](https://treemonk.eu).

### Data quality & history
A **data-issue checker** (impossible dates, duplicates, …), one-click
**merge** of duplicate people, **surname & place normalization**, and a full
**audit log** — every change is recorded and **undoable**.

### Global search
Search people and documents from the top bar; results appear live as you type.

### Local API *(optional, for advanced users)*
TreeMonk can act as a **local HTTP API** for your own scripts and tools:
search people, walk relations and ancestors, read timelines and statistics,
open attached document images, and — only if you allow writes — create and
edit people, families and life events.

- **Off by default, opt-in in Settings** (*Settings → Local API*). Nothing
  changes unless you turn it on.
- **Strictly local**: the server binds to `127.0.0.1` only and every request
  needs the Bearer token generated in Settings. Writes sit behind a second
  toggle, go through the same repository layer as the UI (so the audit log and
  undo history are kept), and open windows refresh live.
- **Self-documenting**: with the server enabled, open
  `http://127.0.0.1:27007/docs` for the built-in offline documentation
  (English · Deutsch · Magyar) and `http://127.0.0.1:27007/api/v1/openapi.json`
  for the OpenAPI 3.1 spec.
No online service and no built-in AI are involved — this only lets tools *you*
choose, running on *your* machine, talk to your local database.

---

## 🔐 Privacy

TreeMonk is **local-first**. Your tree, photos and documents are stored only on
your computer (under your user-data folder, as a SQLite database + media files).
Nothing is uploaded anywhere. The only network calls are opt-in: map tiles,
optional place geocoding, and the update check. The optional
[local API](#local-api-optional-for-advanced-users) is
off by default and, when enabled, listens on `127.0.0.1` only — it is never
reachable from the network.

---

## 🛠️ Build from source

```bash
# 1. Install dependencies (postinstall rebuilds better-sqlite3 for Electron)
npm install

# 2. Run in development (hot reload)
npm run dev

# 3. Production build
npm run build

# 4. Package a Linux app (AppImage + .deb)
npm run dist:linux

# 5. Package a Windows app (NSIS installer)
npm run dist:win

# Typecheck both processes / run tests
npm run typecheck
npm run test:run
```

### Famous-relatives dataset

`npm run dist:*` runs `npm run fetch:famous`, which downloads and compacts the
notable-people dataset into `resources/famous/` (git-ignored).

> Data: **Pantheon 1.0** (Yu, Ronen, Hidalgo et al., MIT Media Lab), CC BY 4.0 —
> see https://pantheon.world. Matches are heuristic (name + birth year).

If the native SQLite module mismatches your Electron version:

```bash
npm run rebuild        # electron-rebuild -f -w better-sqlite3
```

---

## 🏗️ Architecture

```
src/
├─ shared/              # types + IPC contract shared by both processes
├─ main/                # Electron main process (Node + SQLite)
│  ├─ ipc.ts            # registers every ipcMain.handle
│  ├─ db/               # connection, schema, repositories, tree projection, merge
│  ├─ api/              # opt-in local HTTP API + offline /docs
│  └─ gedcom/           # parser, import, export
├─ preload/             # contextBridge → window.api (typed)
└─ renderer/src/        # React app (Zustand store, i18n hu/en/de, components)
```

**Stack:** Electron + electron-vite · React 18 + TypeScript + Tailwind ·
`better-sqlite3` (main process, over typed IPC) · Zustand · MapLibre GL ·
`@xyflow/react` · i18next.

**Data flow:** renderer → `window.api.*` (preload) → `ipcRenderer.invoke` →
`ipcMain.handle` → repository → SQLite. All data lives under
`app.getPath('userData')/data`.

---

## 📄 License

TreeMonk is **source-available**, not open source: the full source is public and
free to read, build and modify, but the [**PolyForm Noncommercial License 1.0.0**](LICENSE)
limits **use** to noncommercial purposes, so it does not meet the OSI
Open Source Definition.

You may use, copy, modify and share TreeMonk for personal, hobby, educational,
research, charitable and other **noncommercial** purposes. You may **not** sell
it, resell it, or use it as part of a commercial product or paid service.
For a commercial license, please get in touch via [treemonk.eu](https://treemonk.eu).

© 2026 TreeMonk — n1kozor
