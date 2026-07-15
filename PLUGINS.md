# Writing TreeMonk Plugins

A TreeMonk plugin is a **sandboxed web panel** that appears in the app's
sidebar and talks to your family tree **exclusively through the local API**,
using its own scoped token. No build tools, no framework, no npm required —
a plugin is a folder with a `manifest.json` and an HTML file, zipped.

The bundled example is a complete, commented template:
[`examples/plugins/longevity-top`](examples/plugins/longevity-top).

---

## How it works (and what a plugin can NEVER do)

- Your panel runs in a **sandboxed iframe** (no Node, no Electron APIs).
- Its Content-Security-Policy allows network access to **`http://127.0.0.1`
  only** — a plugin physically cannot send data to the internet.
- Every API call needs the plugin's **own token**, which the user consents to
  when enabling the plugin, limited to the **permissions** your manifest
  declares. The user can revoke it at any time by disabling the plugin.
- Plugins are installed disabled; the user sees your requested permissions
  before switching one on.

Play inside these rules and your plugin gets a friction-free install story:
no accounts, no review queue, no signing.

## Quickstart

```
my-plugin/
├─ manifest.json
├─ index.html
└─ icon.svg        (optional but recommended)
```

**manifest.json**

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "author": "you",
  "description": {
    "hu": "Rövid leírás magyarul.",
    "en": "A short description in English.",
    "de": "Eine kurze Beschreibung auf Deutsch."
  },
  "icon": "icon.svg",
  "permissions": ["read"],
  "menu": [
    {
      "id": "main",
      "title": { "hu": "Saját nézet", "en": "My view", "de": "Meine Ansicht" },
      "entry": "index.html"
    }
  ]
}
```

**index.html**

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="tmplugin://sdk/treemonk.css" />
    <script src="tmplugin://sdk/treemonk.js"></script>
  </head>
  <body>
    <h1 id="title"></h1>
    <div id="out" class="tm-state">…</div>
    <script>
      document.getElementById('title').textContent =
        TM.t({ hu: 'Helló', en: 'Hello', de: 'Hallo' })

      TM.fetch('/api/v1/stats').then((s) => {
        document.getElementById('out').textContent =
          TM.t({ hu: 'Személyek', en: 'People', de: 'Personen' }) + ': ' + s.people
      })
    </script>
  </body>
</html>
```

Zip the folder's **contents** (manifest at the zip root, or inside a single
top-level folder — both work), then in TreeMonk: sidebar → **Plugins** (puzzle
icon at the bottom) → **Add plugin**. The step-by-step installer validates
your manifest and, when it rejects the zip, shows the exact validator message
so you know what to fix.

## The rules (enforced or expected)

| Rule | How it's enforced |
|---|---|
| `description` and every menu `title` in **all three languages** (hu/en/de) | **Hard** — the installer rejects the zip otherwise |
| Panel **content** localized to `TM.lang` | Expected — trivial with `TM.t({...})`; plugins that ignore it look broken to two-thirds of users |
| **Light AND dark mode** | Expected — free if you use the SDK stylesheet / `--tm-*` variables; the host passes the app's live theme and reloads your panel when it changes |
| Only declare permissions you use | Users see the badges before enabling — over-asking kills installs |
| Escape user data (`textContent`, not `innerHTML`) | Your panel, your XSS — see the example's name rendering |

## Boot parameters

Your entry page receives everything in the **URL hash**:

| Param | Example | Meaning |
|---|---|---|
| `api` | `http://127.0.0.1:27007` | Local API base URL |
| `token` | `plg_…` | Your plugin's scoped Bearer token |
| `lang` | `hu` \| `en` \| `de` | The app's UI language |
| `theme` | `light` \| `dark` | The app's current theme |

`treemonk.js` parses these for you and exposes them as `TM.api`, `TM.token`,
`TM.lang`, `TM.theme` — and stamps `<html data-theme="…">` so the SDK CSS
switches automatically. The panel is reloaded whenever the user changes the
app language or theme, so you never need to handle switching at runtime.

## The SDK

Load both from the reserved `sdk` host (served by the app, works offline):

```html
<link rel="stylesheet" href="tmplugin://sdk/treemonk.css" />
<script src="tmplugin://sdk/treemonk.js"></script>
```

### `TM` helper (treemonk.js)

| Member | What it does |
|---|---|
| `TM.t({hu, en, de})` | Returns the string for the current app language |
| `TM.fetch(path, opts?)` | `fetch` against the local API — auth header, JSON parsing and error throwing handled. `TM.fetch('/api/v1/people?q=kiss')` |
| `TM.api`, `TM.token`, `TM.lang`, `TM.theme` | The boot parameters |

### Stylesheet (treemonk.css)

Base typography and components in TreeMonk's visual language, theme-aware out
of the box:

| Class | Use for |
|---|---|
| `.tm-card` | Panels / list rows (glass-like card) |
| `.tm-row` | Horizontal flex row with gaps |
| `.tm-badge` | Accent pill (counts, ages, tags) |
| `.tm-btn`, `.tm-btn-primary` | Buttons |
| `.tm-input` | Text inputs |
| `.tm-table` | Data tables |
| `.tm-sub`, `.tm-muted`, `.tm-state` | Secondary text / empty-loading states |

For custom styles, use the variables instead of hard-coded colors —
they are what makes dark mode automatic:

`--tm-fg`, `--tm-muted`, `--tm-card`, `--tm-card-solid`, `--tm-border`,
`--tm-accent`, `--tm-accent-soft`, `--tm-danger`, `--tm-radius`.

**Never hard-code text or background colors.** That is the whole trick.

### Icons

Point `manifest.icon` at an SVG in your plugin (24×24 viewBox, `fill="none"`,
`stroke="#000"`, stroke-width 2 — i.e. [Lucide](https://lucide.dev) style; you
can download any Lucide icon and use it as-is after setting the stroke). The
app renders it as a *currentColor mask*, so it tints exactly like the built-in
sidebar icons in every state and theme. An emoji also works; no icon falls
back to a puzzle piece.

## Permissions & the API

| Permission | Grants |
|---|---|
| `read` | Every GET route: people (list/search/detail), families, life events, source citations, occupations, aliases, godparents, notes, research logs, FamilySearch collaborations, pedigree, atlas points, places, stats, GEDCOM export |
| `write` | POST/PATCH/DELETE: create/update/delete people, families, life events. Goes through the same repository layer as the UI — audit log + undo included, and open windows refresh live |
| `documents` | Raw document files (`/api/v1/documents/{id}/file`) — photos, scanned records |

The API is self-documenting: with the server running, open
`http://127.0.0.1:<port>/docs` (hu/en/de) or fetch
`/api/v1/openapi.json`. The MCP endpoint is **never** available to plugin
tokens.

## Developing & debugging

- Install your zip once, then during iteration you can edit the extracted
  files directly under the app's data folder (`%APPDATA%/treemonk/plugins/<id>`
  on Windows, `~/.config/treemonk/plugins/<id>` on Linux) and hit the
  **reload** button in the panel header.
- Re-installing a zip with the same `id` is an in-place update — the enabled
  state and token survive.
- `console.log` from your panel shows up in the app's DevTools (dev builds),
  under the iframe's context.

## Checklist before you ship

- [ ] `description` + all menu `title`s in hu, en and de (the installer checks)
- [ ] All visible text goes through `TM.t({...})`
- [ ] Looks right in light AND dark (toggle the app theme — your panel reloads)
- [ ] Colors come from `--tm-*` variables / SDK classes
- [ ] SVG icon in Lucide style (or a deliberate emoji)
- [ ] Only the permissions you actually call
- [ ] User-sourced strings rendered with `textContent`
- [ ] Version bumped in `manifest.json` on every release
