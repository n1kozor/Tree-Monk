/**
 * Self-contained /docs page for the local API — no external assets (works
 * fully offline), trilingual (HU / EN / DE), endpoint list rendered live from
 * /api/v1/openapi.json so it can never drift from the actual surface.
 */
export const DOCS_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>TreeMonk Local API</title>
<style>
  :root { --bg:#faf8f4; --card:#ffffff; --ink:#1c2420; --mut:#6b7a75; --teal:#0d9488; --line:#e5e0d5; --chip:#eef2ef; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0b0e0d; --card:#151a18; --ink:#f0f4f2; --mut:#8fa09a; --teal:#2dd4bf; --line:#242b28; --chip:#1d2422; }
  }
  * { box-sizing:border-box }
  body { margin:0; font:15px/1.6 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif; background:var(--bg); color:var(--ink) }
  .wrap { max-width:880px; margin:0 auto; padding:40px 20px 80px }
  h1 { font-size:26px; margin:0 0 4px } h2 { font-size:18px; margin:36px 0 10px }
  .mut { color:var(--mut) }
  .langs { float:right } .langs button { border:1px solid var(--line); background:var(--card); color:var(--ink); border-radius:8px; padding:4px 10px; margin-left:4px; cursor:pointer; font-size:13px }
  .langs button.on { border-color:var(--teal); color:var(--teal); font-weight:600 }
  code, pre { font-family:ui-monospace,Consolas,monospace; font-size:13px }
  pre { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:14px 16px; overflow-x:auto }
  .ep { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:10px 14px; margin:8px 0; display:flex; gap:10px; align-items:baseline; flex-wrap:wrap }
  .m { font-weight:700; font-size:12px; border-radius:6px; padding:2px 8px; color:#fff; flex:none }
  .GET{background:#0d9488}.POST{background:#2563eb}.PATCH{background:#d97706}.DELETE{background:#dc2626}
  .path { font-family:ui-monospace,Consolas,monospace; font-size:13px }
  .sum { color:var(--mut); font-size:13px; flex-basis:100% }
  .warn { border-left:3px solid #d97706; background:var(--chip); border-radius:0 10px 10px 0; padding:10px 14px; font-size:14px }
  a { color:var(--teal) }
</style>
</head>
<body>
<div class="wrap">
  <div class="langs">
    <button data-l="hu">HU</button><button data-l="en" class="on">EN</button><button data-l="de">DE</button>
  </div>
  <h1>TreeMonk Local API</h1>
  <p class="mut" data-i="tagline"></p>
  <div class="warn" data-i="security"></div>
  <h2 data-i="authTitle"></h2>
  <p data-i="authBody"></p>
  <pre id="curl"></pre>
  <h2 data-i="epTitle"></h2>
  <div id="eps" class="mut">…</div>
  <h2 data-i="exTitle"></h2>
  <pre id="py"></pre>
</div>
<script>
const T = {
  hu: {
    tagline: 'A családfád adatai HTTP-n keresztül — kizárólag ezen a gépen (127.0.0.1).',
    security: 'A szerver csak a 127.0.0.1 címre csatlakozik, a hálózatról nem érhető el. Minden adat-végponthoz a Beállításokban látható Bearer token kell. Az írás külön kapcsoló mögött van.',
    authTitle: 'Hitelesítés', authBody: 'Minden kéréshez add hozzá az Authorization fejlécet a Beállításokban másolható tokennel:',
    epTitle: 'Végpontok', exTitle: 'Python-példa'
  },
  en: {
    tagline: 'Your family-tree data over HTTP — strictly on this machine (127.0.0.1).',
    security: 'The server binds to 127.0.0.1 only and is not reachable from the network. Every data endpoint requires the Bearer token shown in Settings. Writes sit behind a separate toggle.',
    authTitle: 'Authentication', authBody: 'Add the Authorization header with the token copied from Settings to every request:',
    epTitle: 'Endpoints', exTitle: 'Python example'
  },
  de: {
    tagline: 'Deine Stammbaum-Daten über HTTP — ausschließlich auf diesem Rechner (127.0.0.1).',
    security: 'Der Server bindet nur an 127.0.0.1 und ist aus dem Netzwerk nicht erreichbar. Jeder Daten-Endpunkt erfordert das Bearer-Token aus den Einstellungen. Schreibzugriffe stehen hinter einem separaten Schalter.',
    authTitle: 'Authentifizierung', authBody: 'Füge jeder Anfrage den Authorization-Header mit dem Token aus den Einstellungen hinzu:',
    epTitle: 'Endpunkte', exTitle: 'Python-Beispiel'
  }
}
function setLang(l){
  document.querySelectorAll('.langs button').forEach(b=>b.classList.toggle('on',b.dataset.l===l))
  document.querySelectorAll('[data-i]').forEach(el=>{ el.textContent = T[l][el.dataset.i] })
  localStorage.setItem('tm.docs.lang', l)
}
document.querySelectorAll('.langs button').forEach(b=>b.onclick=()=>setLang(b.dataset.l))
const base = location.origin
document.getElementById('curl').textContent =
  'curl -H "Authorization: Bearer <TOKEN>" ' + base + '/api/v1/people?q=kiss'
document.getElementById('py').textContent =
\`import requests
BASE = "\${base}"
H = {"Authorization": "Bearer <TOKEN>"}
people = requests.get(f"{BASE}/api/v1/people", headers=H, params={"q": "Kiss"}).json()
for p in people["items"]:
    print(p["givenName"], p["surname"], p["birthDate"])\`
fetch('/api/v1/openapi.json').then(r=>r.json()).then(spec=>{
  const eps = document.getElementById('eps'); eps.textContent=''
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [m, op] of Object.entries(methods)) {
      const d = document.createElement('div'); d.className='ep'
      d.innerHTML = '<span class="m '+m.toUpperCase()+'">'+m.toUpperCase()+'</span><span class="path"></span><span class="sum"></span>'
      d.querySelector('.path').textContent = path
      d.querySelector('.sum').textContent = op.summary || ''
      eps.appendChild(d)
    }
  }
}).catch(()=>{ document.getElementById('eps').textContent = 'openapi.json unavailable' })
setLang(localStorage.getItem('tm.docs.lang') || (navigator.language||'en').slice(0,2).replace(/^(?!hu|de).*$/,'en'))
</script>
</body>
</html>`
