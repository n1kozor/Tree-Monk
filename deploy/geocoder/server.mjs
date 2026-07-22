/**
 * TreeMonk geocoder proxy — a tiny, zero-dependency Node server that sits
 * between every installed TreeMonk app and the geocoding upstream.
 *
 * Why it exists: Nominatim's usage policy forbids heavy/bulk use of the
 * public server. This proxy gives ALL TreeMonk users ONE shared, disk-backed
 * cache (most place strings resolve exactly once, ever) and ONE global
 * ≥1.1 s/request throttle towards the public server — or, with
 * LOCATIONIQ_KEY set, a commercial Nominatim-compatible upstream where the
 * API key never leaves the server.
 *
 * Endpoints (Nominatim-compatible, the app calls them verbatim):
 *   GET /search?format=jsonv2&limit=6&addressdetails=1&q=...
 *   GET /status                       → {"ok":true} (the app's health probe)
 *
 * Run:  node server.mjs
 * Env:  PORT (default 8790, binds 127.0.0.1 — put nginx in front)
 *       CACHE_DIR (default ./cache)
 *       LOCATIONIQ_KEY (optional — switches upstream to LocationIQ)
 *       CONTACT (identifying URL/mail for the upstream UA, default treemonk.eu)
 */
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const PORT = Number(process.env.PORT || 8790)
const CACHE_DIR = process.env.CACHE_DIR || './cache'
const LOCATIONIQ_KEY = process.env.LOCATIONIQ_KEY || ''
const CONTACT = process.env.CONTACT || 'https://treemonk.eu'
const UA = `TreeMonk-Geocoder/1.0 (+${CONTACT})`
const MIN_INTERVAL_MS = 1100 // global throttle towards the PUBLIC Nominatim

mkdirSync(CACHE_DIR, { recursive: true })

// One global queue: at most one public-Nominatim request in flight, ≥1.1s apart.
let chain = Promise.resolve()
let lastAt = 0

const cachePath = (key) => join(CACHE_DIR, createHash('sha1').update(key).digest('hex') + '.json')

async function upstream(q, lang) {
  if (LOCATIONIQ_KEY) {
    // Commercial Nominatim-compatible upstream — key stays server-side.
    const url =
      `https://eu1.locationiq.com/v1/search?key=${LOCATIONIQ_KEY}&format=json&addressdetails=1&limit=6` +
      `&accept-language=${encodeURIComponent(lang)}&q=${encodeURIComponent(q)}`
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!res.ok) throw new Error(`upstream ${res.status}`)
    return res.text()
  }
  const run = chain.then(async () => {
    const wait = lastAt + MIN_INTERVAL_MS - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastAt = Date.now()
    const url =
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=1` +
      `&accept-language=${encodeURIComponent(lang)}&q=${encodeURIComponent(q)}`
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!res.ok) throw new Error(`upstream ${res.status}`)
    return res.text()
  })
  chain = run.catch(() => undefined)
  return run
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname === '/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      return res.end('{"ok":true}')
    }
    if (url.pathname !== '/search') {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      return res.end('[]')
    }
    const q = (url.searchParams.get('q') || '').trim()
    // Language changes the returned names → part of the cache key.
    const lang = String(req.headers['accept-language'] || 'en').slice(0, 32)
    if (q.length < 3 || q.length > 200) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      return res.end('[]')
    }
    const file = cachePath(`${lang}|${q.toLowerCase()}`)
    if (existsSync(file)) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'HIT' })
      return res.end(readFileSync(file))
    }
    const body = await upstream(q, lang)
    JSON.parse(body) // never cache/serve a non-JSON upstream error page
    writeFileSync(file, body)
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'MISS' })
    res.end(body)
  } catch {
    // The app treats any non-200 as "proxy unavailable" and falls back.
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end('[]')
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(
    `treemonk-geocoder listening on 127.0.0.1:${PORT} — upstream: ${LOCATIONIQ_KEY ? 'LocationIQ' : 'public Nominatim (throttled)'}`
  )
})
