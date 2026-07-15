/**
 * The official plugin SDK, served by the app itself at tmplugin://sdk/… so
 * every plugin shares one look and one boot pattern:
 *
 *   <link rel="stylesheet" href="tmplugin://sdk/treemonk.css" />
 *   <script src="tmplugin://sdk/treemonk.js"></script>
 *
 * treemonk.js reads the boot params (api/token/lang/theme) from the URL hash,
 * stamps <html data-theme> and exposes a tiny `TM` helper. treemonk.css keys
 * every color off `--tm-*` variables that flip with data-theme — a plugin
 * that uses them is automatically correct in BOTH light and dark mode.
 */

const TREEMONK_CSS = `/* TreeMonk plugin SDK — one look, light + dark for free. */
:root {
  color-scheme: light;
  --tm-bg: transparent;
  --tm-fg: #1c1917;
  --tm-muted: #78716c;
  --tm-card: rgba(255, 255, 255, 0.6);
  --tm-card-solid: #fafaf9;
  --tm-border: rgba(0, 0, 0, 0.08);
  --tm-accent: #0d9488;
  --tm-accent-soft: rgba(13, 148, 136, 0.14);
  --tm-danger: #e11d48;
  --tm-radius: 12px;
}
:root[data-theme='dark'] {
  color-scheme: dark;
  --tm-fg: #e7e5e4;
  --tm-muted: #a8a29e;
  --tm-card: rgba(255, 255, 255, 0.05);
  --tm-card-solid: #1c1917;
  --tm-border: rgba(255, 255, 255, 0.1);
  --tm-accent: #2dd4bf;
  --tm-accent-soft: rgba(45, 212, 191, 0.14);
  --tm-danger: #fb7185;
}
* { box-sizing: border-box; margin: 0; }
body {
  font: 14px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: var(--tm-fg);
  background: var(--tm-bg);
  padding: 20px;
  max-width: 820px;
  margin: 0 auto;
}
h1 { font-size: 18px; margin-bottom: 2px; }
h2 { font-size: 15px; margin: 14px 0 6px; }
a { color: var(--tm-accent); }
.tm-sub { color: var(--tm-muted); font-size: 12px; margin-bottom: 16px; }
.tm-muted { color: var(--tm-muted); }
.tm-card {
  background: var(--tm-card);
  border: 1px solid var(--tm-border);
  border-radius: var(--tm-radius);
  padding: 12px 14px;
  margin-bottom: 8px;
}
.tm-row { display: flex; align-items: center; gap: 12px; }
.tm-badge {
  display: inline-block;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  background: var(--tm-accent-soft);
  color: var(--tm-accent);
  border-radius: 999px;
  padding: 2px 10px;
}
.tm-btn {
  font: inherit;
  color: var(--tm-fg);
  background: var(--tm-card);
  border: 1px solid var(--tm-border);
  border-radius: 10px;
  padding: 6px 14px;
  cursor: pointer;
}
.tm-btn:hover { border-color: var(--tm-accent); color: var(--tm-accent); }
.tm-btn-primary { background: var(--tm-accent); border-color: var(--tm-accent); color: #fff; }
.tm-btn-primary:hover { opacity: 0.9; color: #fff; }
.tm-input {
  font: inherit;
  color: var(--tm-fg);
  background: var(--tm-card);
  border: 1px solid var(--tm-border);
  border-radius: 10px;
  padding: 6px 10px;
  width: 100%;
}
.tm-input:focus { outline: 2px solid var(--tm-accent-soft); border-color: var(--tm-accent); }
.tm-table { width: 100%; border-collapse: collapse; }
.tm-table th {
  text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em;
  color: var(--tm-muted); padding: 6px 10px; border-bottom: 1px solid var(--tm-border);
}
.tm-table td { padding: 7px 10px; border-bottom: 1px solid var(--tm-border); }
.tm-state { color: var(--tm-muted); padding: 32px 0; text-align: center; }
`

const TREEMONK_JS = `/* TreeMonk plugin SDK. Include AFTER treemonk.css, BEFORE your own script. */
;(() => {
  const p = new URLSearchParams(location.hash.slice(1))
  const theme =
    p.get('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  document.documentElement.dataset.theme = theme
  const lang = ['hu', 'en', 'de'].includes(p.get('lang')) ? p.get('lang') : 'en'

  window.TM = {
    /** http://127.0.0.1:<port> — the local API base. */
    api: p.get('api'),
    /** This plugin's own scoped token. Never send it anywhere else. */
    token: p.get('token'),
    /** 'hu' | 'en' | 'de' — the app's UI language. */
    lang,
    /** 'light' | 'dark' — the app's theme (already applied to <html>). */
    theme,
    /** Pick the current language from { hu, en, de }. */
    t(dict) {
      return dict[lang] ?? dict.en ?? Object.values(dict)[0] ?? ''
    },
    /** fetch() against the local API with auth + JSON handled. */
    async fetch(path, opts = {}) {
      const res = await fetch(this.api + path, {
        ...opts,
        headers: {
          Authorization: 'Bearer ' + this.token,
          ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
          ...(opts.headers || {})
        }
      })
      if (!res.ok) throw new Error('API ' + res.status)
      const ct = res.headers.get('content-type') || ''
      return ct.includes('json') ? res.json() : res
    }
  }
})()
`

export const SDK_FILES: Record<string, { mime: string; body: string }> = {
  'treemonk.css': { mime: 'text/css; charset=utf-8', body: TREEMONK_CSS },
  'treemonk.js': { mime: 'text/javascript; charset=utf-8', body: TREEMONK_JS }
}
