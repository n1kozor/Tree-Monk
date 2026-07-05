/**
 * Official FamilySearch integration.
 *
 * Auth: OAuth 2.0 Authorization Code + PKCE, per RFC 8252 (OAuth for Native
 * Apps). The sign-in happens in the user's SYSTEM browser (not an embedded
 * webview); a tiny loopback HTTP server on 127.0.0.1 captures the redirect.
 * TreeMonk never sees the password and never handles a client secret.
 *
 * Configure via env (electron-vite exposes MAIN_VITE_* to the main process):
 *   - MAIN_VITE_FS_CLIENT_ID    the AppKey (public PKCE client id) — REQUIRED
 *   - MAIN_VITE_FS_ENV          'beta' (default) | 'production'
 *   - MAIN_VITE_FS_REDIRECT_URI a redirect URI registered with your AppKey
 *
 * Data: the documented /platform/tree/* endpoints (GEDCOM-X). Reads are mapped
 * into the existing FsNode stream (fsIngest); writes build GEDCOM-X objects and
 * POST them back to the shared Family Tree.
 */
import { safeStorage, shell } from 'electron'
import { createServer, type Server } from 'http'
import { createHash, randomBytes } from 'crypto'
import { wipeDatabase } from './db/admin'
import { AppSettings, Citations, Documents, Events, Occupations, People } from './db/repo'
import { readFile } from 'fs/promises'
import { getDb } from './db/connection'
import { placeLang } from './geo'
import { mediaDocId } from './mediaId'
import type { FsNode } from './db/fsIngest'
import { documentToNodes, findRawFact, personToNode, preferredNameId, relationshipNodes, type GxDocument, type GxPerson } from './fs/gedcomx'
import type {
  FamilySearchImportOptions,
  FamilySearchPersonResult,
  FamilySearchPreview,
  FamilySearchStatus,
  Person
} from '@shared/types'

// ---- Config ----------------------------------------------------------------
const env = import.meta.env
const FS_CLIENT_ID = env.MAIN_VITE_FS_CLIENT_ID ?? process.env.FS_CLIENT_ID ?? ''
const FS_ENV = (env.MAIN_VITE_FS_ENV ?? process.env.FS_ENV ?? 'beta').toLowerCase()
const BETA = FS_ENV !== 'production'
const IDENT = BETA ? 'https://identbeta.familysearch.org' : 'https://ident.familysearch.org'
const API = BETA ? 'https://apibeta.familysearch.org' : 'https://api.familysearch.org'
const AUTH_URL = `${IDENT}/cis-web/oauth2/v3/authorization`
const TOKEN_URL = `${IDENT}/cis-web/oauth2/v3/token`
const REDIRECT_URI =
  env.MAIN_VITE_FS_REDIRECT_URI ?? process.env.FS_REDIRECT_URI ?? 'http://127.0.0.1:4321/auth/callback'
// NOTE: exactly this scope set. Adding 'country' produced sessions whose
// Family Tree WRITES were rejected upstream (verified by A/B token testing).
const SCOPE = 'openid profile email'
const GX_MEDIA = 'application/x-gedcomx-v1+json'
const FS_MEDIA = 'application/x-fs-v1+json'
const MAX_GEN = 8 // FamilySearch caps ancestry at 8 generations per request
const GX = 'http://gedcomx.org/'
const USER_AGENT = 'TreeMonk/1.4 (+https://treemonk.eu)'

export function isFamilySearchConfigured(): boolean {
  return !!FS_CLIENT_ID
}

// ---- Token state (access ~24h, refresh ~90d if granted). Persisted across
// restarts, encrypted with the OS keychain (safeStorage) when available. ------
let cachedToken: string | null = null
let cachedRefresh: string | null = null
let tokensLoaded = false

function persistTokens(): void {
  try {
    const payload = JSON.stringify({ a: cachedToken, r: cachedRefresh })
    if (safeStorage.isEncryptionAvailable()) {
      AppSettings.set('fs_tokens', 'enc:' + safeStorage.encryptString(payload).toString('base64'))
    } else {
      // No OS keychain (rare) — store obfuscated; the access token expires in 24h.
      AppSettings.set('fs_tokens', 'b64:' + Buffer.from(payload).toString('base64'))
    }
  } catch {
    /* persistence is best-effort */
  }
}

function loadTokens(): void {
  if (tokensLoaded) return
  tokensLoaded = true
  try {
    const raw = AppSettings.get('fs_tokens')
    if (!raw) return
    const payload = raw.startsWith('enc:')
      ? safeStorage.decryptString(Buffer.from(raw.slice(4), 'base64'))
      : raw.startsWith('b64:')
        ? Buffer.from(raw.slice(4), 'base64').toString('utf8')
        : null
    if (!payload) return
    const t = JSON.parse(payload) as { a?: string | null; r?: string | null }
    cachedToken = t.a ?? null
    cachedRefresh = t.r ?? null
  } catch {
    /* corrupted/undecryptable → start signed out */
  }
}

function clearTokens(): void {
  cachedToken = null
  cachedRefresh = null
  AppSettings.set('fs_tokens', null)
}

export function getCachedToken(): string | null {
  loadTokens()
  return cachedToken
}
export function isSignedIn(): boolean {
  loadTokens()
  return !!cachedToken
}
/** No passwords are handled — kept only to satisfy the legacy IPC contract. */
export function getCachedCreds(): { username: string; password: string } | null {
  return null
}
export function rememberCreds(): void {
  /* no-op */
}
export function forgetCreds(): void {
  clearTokens()
  currentTree = null
  relSnapshot = null
}

// ---- PKCE + loopback browser sign-in (RFC 8252) ----------------------------
const b64url = (b: Buffer): string =>
  b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const enc = encodeURIComponent

const BROWSER_TEXTS: Record<string, { okTitle: string; okMsg: string; errTitle: string; errMsg: string }> = {
  hu: {
    okTitle: 'Sikeres belépés a FamilySearch-be',
    okMsg: 'Be vagy jelentkezve. Ezt a lapot bezárhatod, és visszatérhetsz a TreeMonkba.',
    errTitle: 'A belépés nem sikerült',
    errMsg: 'Valami hiba történt. Zárd be ezt a lapot, és próbáld újra a TreeMonkban.'
  },
  de: {
    okTitle: 'Erfolgreich bei FamilySearch angemeldet',
    okMsg: 'Du bist angemeldet. Du kannst diesen Tab schließen und zu TreeMonk zurückkehren.',
    errTitle: 'Anmeldung fehlgeschlagen',
    errMsg: 'Etwas ist schiefgelaufen. Schließe diesen Tab und versuche es in TreeMonk erneut.'
  },
  en: {
    okTitle: 'Signed in to FamilySearch',
    okMsg: 'You are signed in. You can close this tab and return to TreeMonk.',
    errTitle: 'Sign-in failed',
    errMsg: 'Something went wrong. Please close this tab and try again in TreeMonk.'
  }
}

function browserResponse(ok: boolean, lang = 'en'): string {
  const tx = BROWSER_TEXTS[lang.slice(0, 2)] ?? BROWSER_TEXTS.en
  const title = ok ? tx.okTitle : tx.errTitle
  const msg = ok ? tx.okMsg : tx.errMsg
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font:16px/1.6 -apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#faf7f1;color:#1c2420;
display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.c{max-width:420px;text-align:center;padding:32px;background:#fff;border:1px solid #e8e1d4;border-radius:16px;
box-shadow:0 20px 60px -30px rgba(20,40,30,.3)}h1{font-size:20px;margin:0 0 8px;color:${ok ? '#0d9488' : '#b91c1c'}}
p{color:#6c726a;margin:0}</style></head><body><div class="c"><h1>${title}</h1><p>${msg}</p></div></body></html>`
}

/** Opens FamilySearch's own sign-in page in the system browser, captures the
 *  redirect on a loopback port, and exchanges the code for tokens. */
export function loginFamilySearchOAuth(lang = 'en'): Promise<{ ok: boolean; error?: string }> {
  if (!FS_CLIENT_ID) return Promise.resolve({ ok: false, error: 'NO_CLIENT_ID' })
  return new Promise((resolve) => {
    const verifier = b64url(randomBytes(48))
    const challenge = b64url(createHash('sha256').update(verifier).digest())
    const state = b64url(randomBytes(16))
    let cbUrl: URL
    try {
      cbUrl = new URL(REDIRECT_URI)
    } catch {
      resolve({ ok: false, error: 'BAD_REDIRECT_URI' })
      return
    }
    const port = Number(cbUrl.port) || 80
    const callbackPath = cbUrl.pathname || '/'

    let settled = false
    let server: Server
    const timer = setTimeout(() => finish({ ok: false, error: 'TIMEOUT' }), 5 * 60 * 1000)
    const finish = (r: { ok: boolean; error?: string }): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        server.close()
      } catch {
        /* ignore */
      }
      resolve(r)
    }

    server = createServer((req, res) => {
      let reqUrl: URL
      try {
        reqUrl = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
      } catch {
        res.writeHead(400).end()
        return
      }
      if (reqUrl.pathname !== callbackPath) {
        res.writeHead(404).end()
        return
      }
      const code = reqUrl.searchParams.get('code')
      const st = reqUrl.searchParams.get('state')
      const err = reqUrl.searchParams.get('error')
      const ok = !err && !!code && st === state
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(browserResponse(ok, lang))
      if (err) return finish({ ok: false, error: err })
      if (!code || st !== state) return finish({ ok: false, error: 'INVALID_CALLBACK' })
      void exchangeCode(code, verifier).then((toks) => {
        if (!toks) return finish({ ok: false, error: 'TOKEN_EXCHANGE_FAILED' })
        cachedToken = toks.access
        cachedRefresh = toks.refresh
        persistTokens()
        finish({ ok: true })
      })
    })
    server.on('error', () => finish({ ok: false, error: 'PORT_IN_USE' }))
    server.listen(port, '127.0.0.1', () => {
      const authUrl =
        AUTH_URL +
        '?response_type=code' +
        '&client_id=' + enc(FS_CLIENT_ID) +
        '&redirect_uri=' + enc(REDIRECT_URI) +
        '&scope=' + enc(SCOPE) +
        '&state=' + enc(state) +
        '&code_challenge=' + enc(challenge) +
        '&code_challenge_method=S256'
      void shell.openExternal(authUrl)
    })
  })
}

async function exchangeCode(
  code: string,
  verifier: string
): Promise<{ access: string; refresh: string | null } | null> {
  return tokenRequest(
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: FS_CLIENT_ID,
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier
    })
  )
}

/** Exchange the refresh token for a fresh access token (if the key is granted
 *  refresh tokens; public clients often are not, in which case re-login). */
async function tryRefresh(): Promise<boolean> {
  if (!cachedRefresh) return false
  const toks = await tokenRequest(
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: FS_CLIENT_ID,
      refresh_token: cachedRefresh
    })
  )
  if (!toks) {
    cachedRefresh = null
    return false
  }
  cachedToken = toks.access
  cachedRefresh = toks.refresh ?? cachedRefresh
  persistTokens()
  return true
}

async function tokenRequest(
  body: URLSearchParams
): Promise<{ access: string; refresh: string | null } | null> {
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
      body
    })
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.error('[fs] token request', res.status, (await res.text()).slice(0, 300))
      return null
    }
    const data = (await res.json()) as { access_token?: string; refresh_token?: string }
    return data.access_token ? { access: data.access_token, refresh: data.refresh_token ?? null } : null
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[fs] token request threw', e)
    return null
  }
}

// ---- API layer (bearer + GEDCOM-X + throttle + 401-refresh) ----------------
let lastCall = 0
async function throttle(): Promise<void> {
  const wait = lastCall + 130 - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastCall = Date.now()
}

async function gxGet(
  path: string,
  media: string = GX_MEDIA
): Promise<{ status: number; doc: GxDocument | null; location?: string }> {
  loadTokens()
  if (!cachedToken) return { status: 401, doc: null }
  for (let attempt = 0; attempt < 4; attempt++) {
    await throttle()
    const res = await fetch(API + path, {
      redirect: 'manual',
      headers: {
        Authorization: `Bearer ${cachedToken}`,
        Accept: media,
        'User-Agent': USER_AGENT,
        // Node's fetch defaults to "accept-language: *", which the Family Tree
        // WRITE upstream rejects with 400 — always send a concrete language.
        'Accept-Language': 'en'
      }
    })
    if (res.status === 401 && attempt === 0 && (await tryRefresh())) continue
    if (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
      continue
    }
    if (res.status === 204) return { status: 204, doc: null }
    if (res.status >= 300 && res.status < 400) {
      return { status: res.status, doc: null, location: res.headers.get('Location') ?? undefined }
    }
    if (res.status === 401) {
      // Expired and unrefreshable → sign out cleanly so the UI prompts again.
      clearTokens()
      return { status: 401, doc: null }
    }
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.error('[fs] GET', path, '→', res.status, (await res.text().catch(() => '')).slice(0, 200))
      return { status: res.status, doc: null }
    }
    const doc = (await res.json().catch(() => null)) as GxDocument | null
    return { status: res.status, doc }
  }
  return { status: 429, doc: null }
}

async function gxPost(
  path: string,
  body: object,
  reason?: string,
  media: string = GX_MEDIA
): Promise<{ status: number; location?: string; entityId?: string; error?: string }> {
  loadTokens()
  if (!cachedToken) return { status: 401 }
  for (let attempt = 0; attempt < 4; attempt++) {
    await throttle()
    const res = await fetch(API + path, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        Authorization: `Bearer ${cachedToken}`,
        'Content-Type': media,
        Accept: media,
        'User-Agent': USER_AGENT,
        // undici would default to "accept-language: *" → TF write upstream 400.
        'Accept-Language': 'en',
        ...(reason ? { 'X-Reason': reason } : {})
      },
      body: JSON.stringify(body)
    })
    if (res.status === 401 && attempt === 0 && (await tryRefresh())) continue
    if (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) {
      // Throttled or the beta service is momentarily unavailable — back off and retry.
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
      continue
    }
    if (res.status >= 200 && res.status < 300) {
      // eslint-disable-next-line no-console
      console.log('[fs] POST', path, '→', res.status, res.headers.get('X-entity-id') ?? '')
      return {
        status: res.status,
        location: res.headers.get('Location') ?? undefined,
        entityId: res.headers.get('X-entity-id') ?? undefined
      }
    }
    if (res.status === 401) {
      clearTokens()
      return { status: 401, error: 'UNAUTHORIZED' }
    }
    const errText = (await res.text().catch(() => '')).slice(0, 500)
    // eslint-disable-next-line no-console
    console.error('[fs] POST', path, '→', res.status, errText, '\n  sent:', JSON.stringify(body).slice(0, 500))
    return { status: res.status, error: errText }
  }
  return { status: 429 }
}


const personUri = (fid: string): string => `${API}/platform/tree/persons/${fid}`

// ---- Tree selection (the beta AppKey is scoped to "special" user trees) -----
// Reads (ancestry/sync/search) run against the GLOBAL shared tree; writes go
// into a TreeMonk-owned user tree — the key cannot create persons in GLOBAL.
let currentTree: string | null = null

async function selectTree(treeId: string): Promise<boolean> {
  if (currentTree === treeId) return true
  const r = await gxPost('/platform/trees/current', { trees: [{ id: treeId }] }, undefined, FS_MEDIA)
  if (r.status >= 200 && r.status < 300) {
    currentTree = treeId
    return true
  }
  return false
}

/** Verify a FamilySearch person id before import: does it exist, and who is
 *  it? Returns the display name + lifespan so the user can confirm the right
 *  starting person. */
export async function lookupFsPerson(
  fid: string,
  treeId?: string
): Promise<{ found: boolean; name?: string; lifespan?: string; gender?: string }> {
  loadTokens()
  if (!cachedToken) return { found: false }
  const id = fid.trim().toUpperCase()
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{3,4}$/.test(id)) return { found: false }
  await selectTree(treeId && treeId !== 'GLOBAL' ? treeId : 'GLOBAL')
  const r = await gxGet(`/platform/tree/persons/${enc(id)}`)
  const gp = r.doc?.persons?.find((x) => x.id === id) ?? r.doc?.persons?.[0]
  if (!gp) return { found: false }
  const disp = gp.display ?? {}
  return {
    found: true,
    name: disp.name ?? id,
    lifespan: disp.lifespan ?? undefined,
    gender: disp.gender ?? undefined
  }
}

export interface FsTreeInfo {
  id: string
  name: string
  /** 'global' = the shared FamilySearch Family Tree; 'user' = a personal tree. */
  kind: 'global' | 'user'
}

/** List the trees the user can import from: the shared Family Tree plus every
 *  personal tree they own (via their groups, which carry the treeIds — the same
 *  list shown on beta.familysearch.org/groups/trees). */
export async function listFamilySearchTrees(): Promise<FsTreeInfo[]> {
  loadTokens()
  const trees: FsTreeInfo[] = [{ id: 'GLOBAL', name: 'Family Tree', kind: 'global' }]
  if (!cachedToken) return trees
  await throttle()
  try {
    const res = await fetch(`${API}/platform/groups`, {
      headers: {
        Authorization: `Bearer ${cachedToken}`,
        Accept: 'application/x-fs-v1+json',
        'User-Agent': USER_AGENT,
        'Accept-Language': 'en'
      }
    })
    if (!res.ok) return trees
    const data = (await res.json()) as { groups?: { name?: string; treeIds?: string[] }[] }
    for (const g of data.groups ?? []) {
      for (const tid of g.treeIds ?? []) {
        if (tid && !trees.some((t) => t.id === tid)) {
          trees.push({ id: tid, name: g.name ?? tid, kind: 'user' })
        }
      }
    }
  } catch {
    /* fall back to just the Family Tree */
  }
  return trees
}



// ---- Per-person extras (portrait, memories, sources, notes) ----------------
interface GxSourceDescription {
  id?: string
  about?: string
  titles?: { value?: string }[]
  citations?: { value?: string }[]
  notes?: { subject?: string; text?: string }[]
  links?: Record<string, { href?: string }>
}
interface GxExtrasDoc {
  sourceDescriptions?: GxSourceDescription[]
  persons?: (GxPerson & { notes?: { subject?: string; text?: string }[] })[]
}

export interface PersonExtras {
  media: { u: string; t: string | null }[]
  notes: string[]
  sources: FsNode[]
}

/** Read the person document, falling back to the TreeMonk user tree (persons
 *  we contributed live there, not in GLOBAL). */
const docCache = new Map<string, { doc: GxDocument | null; at: number }>()
async function getPersonDoc(fid: string): Promise<GxDocument | null> {
  const hit = docCache.get(fid)
  if (hit && Date.now() - hit.at < 4000) return hit.doc
  const doc = await getPersonDocUncached(fid)
  docCache.set(fid, { doc, at: Date.now() })
  return doc
}
async function getPersonDocUncached(fid: string): Promise<GxDocument | null> {
  await selectTree('GLOBAL')
  let r = await gxGet(`/platform/tree/persons/${enc(fid)}`)
  if (!r.doc) {
    const treeId = AppSettings.get('fs_user_tree_id')
    if (treeId && (await selectTree(treeId))) {
      r = await gxGet(`/platform/tree/persons/${enc(fid)}`)
    }
  }
  return r.doc
}

/** Fetch EVERYTHING the API offers for one person beyond the core record:
 *  portrait, memories (photos/documents), attached sources and notes. */
async function fetchPersonExtras(fid: string): Promise<PersonExtras> {
  const media: { u: string; t: string | null }[] = []
  const notes: string[] = []
  const sources: FsNode[] = []

  // Fetch all four extras concurrently (throttle-bound, but overlaps network
  // latency — much faster than one after another).
  const [por, mem, not, src] = await Promise.all([
    gxGet(`/platform/tree/persons/${enc(fid)}/portrait`),
    gxGet(`/platform/tree/persons/${enc(fid)}/memories`),
    gxGet(`/platform/tree/persons/${enc(fid)}/notes`),
    gxGet(`/platform/tree/persons/${enc(fid)}/sources`)
  ])

  // Portrait: a 307 redirect carries the image URL in Location.
  // NOTE: title must stay EMPTY — the ingester treats untitled images as the
  // person's portrait (avatar); a titled one would become a document scan.
  if (por.location) media.push({ u: por.location, t: null })

  // Memories: photos / document scans / stories attached to the person.
  for (const d of ((mem.doc as unknown as GxExtrasDoc | null)?.sourceDescriptions ?? [])) {
    const url = d.links?.image?.href ?? d.links?.['image-thumbnail']?.href ?? d.about
    if (url && !media.some((m) => m.u === url)) {
      media.push({ u: url, t: d.titles?.[0]?.value ?? null })
    }
  }

  // Notes (subject + text).
  for (const n of ((not.doc as unknown as GxExtrasDoc | null)?.persons?.[0]?.notes ?? [])) {
    const txt = [n.subject, n.text].filter(Boolean).join(': ')
    if (txt) notes.push(txt)
  }

  // Sources (descriptions with title / citation / note).
  for (const d of ((src.doc as unknown as GxExtrasDoc | null)?.sourceDescriptions ?? [])) {
    const ti = d.titles?.[0]?.value ?? null
    if (!d.id && !ti) continue
    sources.push({
      t: 's',
      p: fid,
      sid: d.id ?? ti ?? '',
      ti,
      au: null,
      pu: d.citations?.[0]?.value ?? null,
      pg: null,
      // The record's own URL goes into the note — the sources panel renders
      // URLs as clickable links, so the user can open the original record.
      no: [d.notes?.[0]?.text, d.about].filter(Boolean).join('\n') || null
    })
  }

  return { media, notes, sources }
}

/** Fill any FS-linked person left EMPTY after an import (a stub created by a
 *  relationship edge whose full record was never fetched — e.g. a pagination
 *  gap or a cross-reference). Fetches their real data + extras. Never deletes
 *  anyone. Loops until no empty FS person remains (bounded), since a filled
 *  person may reference further stubs. */
export async function fillEmptyFsPersons(
  treeId: string | null,
  onStatus?: (s: FamilySearchStatus) => void,
  onNode?: (n: FsNode) => void
): Promise<number> {
  loadTokens()
  if (!cachedToken) return 0
  const db = getDb()
  let filled = 0
  for (let round = 0; round < 6; round++) {
    if (cancelled) break
    const empties = db
      .prepare(
        `SELECT fs_id FROM people
         WHERE coalesce(fs_id,'') != ''
           AND trim(coalesce(given_name,'')) = '' AND trim(coalesce(surname,'')) = ''`
      )
      .all() as { fs_id: string }[]
    if (!empties.length) break
    for (const row of empties) {
      if (cancelled) break
      const fid = row.fs_id
      if (treeId && treeId !== 'GLOBAL') await selectTree(treeId)
      else await selectTree('GLOBAL')
      const r = await gxGet(`/platform/tree/persons/${enc(fid)}`)
      const gp = r.doc?.persons?.find((x) => x.id === fid) ?? r.doc?.persons?.[0]
      const n = gp ? personToNode(gp) : null
      if (n && n.t === 'i') {
        const extras = await fetchPersonExtras(fid)
        if (extras.media.length) n.media = extras.media
        if (extras.notes.length) n.no = extras.notes
        onNode?.(n)
        for (const sn of extras.sources) onNode?.(sn)
        if (r.doc) for (const rn of relationshipNodes(r.doc)) onNode?.(rn)
        filled++
        status(onStatus ?? (() => {}), 'processed', { name: `${n.g} ${n.s}`.trim() || fid, count: filled })
      } else {
        // The person no longer resolves on FS (deleted/merged) — leave the stub
        // for the change scan to flag; do NOT delete (it may be a real child).
        break
      }
    }
  }
  return filled
}

/** GET an atom feed (tree person-id pages)/** GET an atom feed (tree person-id pages) → entry ids + the next-page href. */
async function gxGetAtom(path: string): Promise<{ ids: string[]; next: string | null }> {
  loadTokens()
  if (!cachedToken) return { ids: [], next: null }
  await throttle()
  try {
    const res = await fetch(API + path, {
      headers: {
        Authorization: `Bearer ${cachedToken}`,
        Accept: 'application/x-gedcomx-atom+json',
        'User-Agent': USER_AGENT,
        'Accept-Language': 'en'
      }
    })
    if (!res.ok) return { ids: [], next: null }
    const data = (await res.json()) as {
      entries?: { id?: string }[]
      links?: { next?: { href?: string } }
    }
    const ids = (data.entries ?? []).map((e) => e.id).filter((x): x is string => !!x)
    const nextHref = data.links?.next?.href ?? null
    const next = nextHref ? nextHref.replace(/^https?:\/\/[^/]+\/platform/, '') : null
    return { ids, next }
  } catch {
    return { ids: [], next: null }
  }
}


/** Resolve the starting person fid: explicit root, else the current user. */
async function resolveRoot(root?: string): Promise<string | null> {
  await selectTree('GLOBAL')
  if (root) return root
  const r = await gxGet('/platform/tree/current-person')
  if (r.location) return r.location.replace(/^.*\/persons\//, '').replace(/[/?].*$/, '')
  if (r.doc?.persons?.[0]?.id) return r.doc.persons[0].id
  return null
}

const status = (
  onStatus: ((s: FamilySearchStatus) => void) | undefined,
  phase: FamilySearchStatus['phase'],
  extra: Partial<FamilySearchStatus> = {}
): void => onStatus?.({ phase, ...extra })

// ---- Read: import / preview / sync / search --------------------------------
let cancelled = false
export function cancelFamilySearchImport(): void {
  cancelled = true
}

export async function importFromFamilySearch(
  opts: FamilySearchImportOptions,
  onStatus: (s: FamilySearchStatus) => void,
  onNode: (node: FsNode) => void
): Promise<{ rootFid: string }> {
  cancelled = false
  if (opts.replace === true) wipeDatabase()
  relSnapshot = null // reload the relatives snapshot from the (possibly wiped) DB
  status(onStatus, 'auth')

  // The tree to import from — shared Family Tree ('GLOBAL') or a personal tree.
  const treeId = opts.treeId && opts.treeId !== 'GLOBAL' ? opts.treeId : 'GLOBAL'
  await selectTree(treeId)

  // Starting person: the given fid, else (shared tree) the current user, else
  // (a personal tree with no root given) the tree's first person.
  let root = opts.root ?? null
  if (!root) {
    if (treeId === 'GLOBAL') root = await resolveRoot(opts.root)
    else {
      const first = await gxGetAtom(`/platform/trees/${enc(treeId)}/persons?count=1&view=%22identifiers%22`)
      root = first.ids[0] ?? null
    }
  }
  if (!root) throw new Error('Could not determine the starting person.')

  status(onStatus, 'fetching_root')
  // BFS from the starting person over /families, so EVERY person is fully
  // fetched before any relationship edge is emitted — guaranteeing no empty
  // stub is ever created. Ancestors go up (ascend), descendants go down
  // (descend); each person's spouse(s) and the root's children/marriages are
  // always included.
  const ascend = Math.max(0, opts.ascend ?? 4)
  const descend = Math.max(0, opts.childrenDepth ?? 2)

  const maxPersons = Math.max(1, opts.maxPersons ?? 5000)

  // Priority-ordered traversal: DIRECT ANCESTORS first (closest generation
  // first), then THEIR children (collateral: siblings, aunts/uncles, cousins),
  // then the root's descendants. Lower prio = pulled in first, so when the
  // person cap is hit we already have the most important people.
  type Role = 'root' | 'ancestor' | 'descendant' | 'collateral' | 'spouse'
  interface Item {
    fid: string
    gen: number
    role: Role
    prio: number
  }
  const gen = new Map<string, number>()
  const role = new Map<string, Role>()
  const allEdges: FsNode[] = []
  const pq: Item[] = [{ fid: root, gen: 0, role: 'root', prio: 0 }]
  gen.set(root, 0)
  role.set(root, 'root')

  const consider = (fid: string, g: number, rl: Role, prio: number): void => {
    if (gen.has(fid)) return
    if (gen.size >= maxPersons) return // person cap reached — stop widening
    gen.set(fid, g)
    role.set(fid, rl)
    pq.push({ fid, gen: g, role: rl, prio })
  }

  status(onStatus, 'ancestors')
  while (pq.length && !cancelled && gen.size <= maxPersons) {
    // Pop the highest-priority (lowest prio number) item.
    let mi = 0
    for (let i = 1; i < pq.length; i++) if (pq[i].prio < pq[mi].prio) mi = i
    const it = pq.splice(mi, 1)[0]
    const hops = Math.abs(it.gen)
    const fam = await fetchPersonFamilies(it.fid, treeId)
    recordKnownRelatives(it.fid, fam.relatives.map((r) => r.fid))
    allEdges.push(...fam.edges)
    for (const rel of fam.relatives) {
      if (rel.kind === 'spouse') {
        // A spouse on the DIRECT line (the root, or a direct ancestor) is a
        // co-ancestor of the shared children — walk THEIR ancestors too. A
        // spouse of a descendant/collateral is just included as a leaf.
        if (it.role === 'root' || it.role === 'ancestor') {
          consider(rel.fid, it.gen, 'ancestor', it.prio + 0.5)
        } else {
          consider(rel.fid, it.gen, 'spouse', it.prio + 0.5)
        }
      } else if (rel.kind === 'parent') {
        // Direct ancestral line (top priority): only from root/ancestor, up to ascend.
        if ((it.role === 'root' || it.role === 'ancestor') && it.gen < ascend) {
          consider(rel.fid, it.gen + 1, 'ancestor', it.gen + 1)
        }
      } else if (rel.kind === 'child') {
        if (it.role === 'root' || it.role === 'descendant') {
          // Root's descendants (children, grandchildren…), down to descend.
          if (-it.gen < descend) consider(rel.fid, it.gen - 1, 'descendant', 100000 + hops)
        } else if (it.role === 'ancestor' || it.role === 'collateral') {
          // Children of an ancestor = collateral relatives (after the direct
          // line, before root's descendants).
          consider(rel.fid, it.gen - 1, 'collateral', 1000 + hops)
        }
      }
    }
  }

  // Fetch every collected person COMPLETELY (record + portrait + notes +
  // sources). Persons are emitted here, before any edge.
  const fids = [...gen.keys()]
  const fidSet = new Set(fids)
  let processed = 0
  for (const fid of fids) {
    if (cancelled) break
    await selectTree(treeId)
    const r = await gxGet(`/platform/tree/persons/${enc(fid)}`)
    const gp = r.doc?.persons?.find((x) => x.id === fid) ?? r.doc?.persons?.[0]
    const n = gp ? personToNode(gp) : null
    if (!n || n.t !== 'i') continue
    const extras = await fetchPersonExtras(fid)
    if (extras.media.length) n.media = extras.media
    if (extras.notes.length) n.no = extras.notes
    onNode(n)
    for (const sn of extras.sources) {
      if (cancelled) break
      onNode(sn)
    }
    processed++
    status(onStatus, 'processed', { name: `${n.g} ${n.s}`.trim() || fid, count: processed })
  }
  status(onStatus, 'ancestors_done')

  saveRelSnapshot()

  // Emit edges — ONLY between persons we actually fetched, so a relationship
  // never invents an empty placeholder.
  for (const e of allEdges) {
    if (cancelled) break
    if (e.t === 'f') {
      if (fidSet.has(e.a) && fidSet.has(e.b)) onNode(e)
    } else if (e.t === 'c') {
      if (!fidSet.has(e.c)) continue
      const f = e.f && fidSet.has(e.f) ? e.f : null
      const m = e.m && fidSet.has(e.m) ? e.m : null
      if (f || m) onNode({ t: 'c', f, m, c: e.c })
    } else if (e.t === 'gp') {
      if (fidSet.has(e.c) && fidSet.has(e.p)) onNode(e)
    }
  }

  // Always anchor the tree on the starting person (the signed-in user's FS
  // person, or the explicitly chosen root) — set as the global root person.
  if (!opts.keepRoot) {
    const rootPerson = People.findByFsId(root)
    if (rootPerson) AppSettings.set('default_root_person_id', rootPerson.id)
  }
  return { rootFid: root }
}

export async function previewFamilySearch(opts: {
  root?: string
  ascend?: number
  onStatus?: (s: FamilySearchStatus) => void
}): Promise<FamilySearchPreview> {
  status(opts.onStatus, 'auth')
  const root = await resolveRoot(opts.root)
  if (!root) throw new Error('Could not determine the starting person.')
  status(opts.onStatus, 'fetching_root')
  const generations = Math.min(MAX_GEN, Math.max(1, opts.ascend ?? 4))
  const r = await gxGet(`/platform/tree/ancestry?person=${enc(root)}&generations=${generations}`)
  const persons = r.doc?.persons ?? []
  const rootP = persons.find((p) => p.id === root) ?? persons[0]
  return {
    root: rootP ? personToResult(rootP) : { id: root, name: root, lifespan: null, gender: null },
    ancestors: Math.max(0, persons.length - 1)
  }
}

export async function syncPersonFromFamilySearch(opts: { fid: string }): Promise<FsNode[]> {
  const doc = await getPersonDoc(opts.fid)
  if (!doc) return []
  const nodes = documentToNodes(doc)
  // Enrich the main person with EVERYTHING the API offers.
  const main = nodes.find((n) => n.t === 'i' && n.fid === opts.fid)
  if (main && main.t === 'i') {
    const extras = await fetchPersonExtras(opts.fid)
    if (extras.media.length) main.media = extras.media
    if (extras.notes.length) main.no = extras.notes
    nodes.push(...extras.sources)
  }
  return nodes
}

export async function searchFamilySearch(opts: { query: string }): Promise<FamilySearchPersonResult[]> {
  await selectTree('GLOBAL')
  const toks = opts.query.trim().split(/\s+/).filter(Boolean)
  const surname = toks.length > 1 ? toks.at(-1)! : ''
  const given = toks.length > 1 ? toks.slice(0, -1).join(' ') : opts.query.trim()
  const qs = new URLSearchParams()
  if (given) qs.set('q.givenName', given)
  if (surname) qs.set('q.surname', surname)
  const r = await gxGet(`/platform/tree/search?${qs.toString()}`)
  const entries = (r.doc as { entries?: { content?: { gedcomx?: GxDocument } }[] } | null)?.entries ?? []
  const out: FamilySearchPersonResult[] = []
  for (const e of entries) {
    const p = e.content?.gedcomx?.persons?.[0]
    if (p?.id) out.push(personToResult(p))
  }
  return out
}

function personToResult(p: GxPerson): FamilySearchPersonResult {
  return {
    id: p.id ?? '',
    name: p.display?.name ?? '—',
    lifespan: p.display?.lifespan ?? null,
    gender: p.display?.gender ?? p.gender?.type ?? null
  }
}

// ---- Write: contribute a local person / family back to the FamilySearch tree


function setLocalFsId(personId: string, fid: string): void {
  getDb()
    .prepare('UPDATE people SET fs_id = ?, updated_at = ? WHERE id = ?')
    .run(fid, new Date().toISOString(), personId)
}









// ---- Two-way person sync: diff preview + push ------------------------------
export interface FsFieldDiff {
  field: string
  local: string | null
  remote: string | null
}

/** Compare a linked local person with their FamilySearch record. `pull` lists
 *  fields where FamilySearch differs (what a refresh would change); `push`
 *  lists local data missing on FamilySearch (what an upload would add). */
export async function familySearchPersonDiff(
  personId: string
): Promise<{ pull: FsFieldDiff[]; push: FsFieldDiff[] } | { error: string }> {
  if (!cachedToken) return { error: 'NOT_SIGNED_IN' }
  const p = People.get(personId)
  if (!p) return { error: 'NOT_FOUND' }
  if (!p.fsId) return { error: 'NOT_LINKED' }
  const doc = await getPersonDoc(p.fsId)
  const gp = doc?.persons?.find((x) => x.id === p.fsId) ?? doc?.persons?.[0]
  if (!gp) return { error: 'FS_NOT_FOUND' }
  const n = personToNode(gp)
  if (!n || n.t !== 'i') return { error: 'FS_NOT_FOUND' }

  const rows: [string, string | null, string | null][] = [
    ['givenName', p.givenName || null, n.g || null],
    ['surname', p.surname || null, n.s || null],
    ['birthDate', p.birthDate, n.bd],
    ['birthPlace', p.birthPlace, n.bp],
    ['deathDate', p.deathDate, n.dd],
    ['deathPlace', p.deathPlace, n.dp],
    ['christeningDate', p.christeningDate, n.cd ?? null],
    ['christeningPlace', p.christeningPlace, n.cp ?? null],
    ['burialDate', p.burialDate, n.bud ?? null],
    ['burialPlace', p.burialPlace, n.bup ?? null],
    ['religion', p.religion, n.re ?? null],
    ['birthNote', p.birthNote, n.bn ?? null],
    ['deathNote', p.deathNote, n.dn ?? null],
    ['christeningNote', p.christeningNote, n.cn ?? null],
    ['burialNote', p.burialNote, n.un ?? null]
  ]
  const pull: FsFieldDiff[] = []
  const push: FsFieldDiff[] = []
  for (const [field, local, remote] of rows) {
    if (remote && remote !== local) pull.push({ field, local, remote })
    // Push lists everything the LOCAL side would change on FamilySearch:
    // missing there OR different there.
    if (local && local !== remote) push.push({ field, local, remote })
  }
  return { pull, push }
}

/** Upload THIS person's data to their FamilySearch record with the surgical,
 *  API-verified recipes: name updates carry id + type + preferred + attribution
 *  (server requires the full shape); missing facts are ADDED (no id); changed
 *  facts are replaced by DELETE conclusion + ADD (in-place fact update is 405
 *  on this environment). Nothing else on the record is touched. */
/** Exactly what a push (upload) WOULD change on FamilySearch — computed
 *  read-only so the confirmation modal can list every change before the user
 *  commits. Categories map to i18n labels; `text` is the concrete value. */
export interface FsPushChange {
  type:
    | 'name'
    | 'birth'
    | 'christening'
    | 'death'
    | 'burial'
    | 'religion'
    | 'occupation'
    | 'event'
    | 'note'
    | 'photo'
    | 'portrait'
    | 'source'
    | 'couple'
    | 'parentChild'
  text: string
  /** true = updates/overwrites an existing FamilySearch conclusion (riskier);
   *  false = adds new data. */
  overwrite: boolean
}



// ---- Relatives: what exists on FamilySearch around one person --------------
export interface FsRelative {
  fid: string
  name: string
  kind: 'spouse' | 'child' | 'parent' | 'godparent'
}

interface FamiliesInfo {
  relatives: FsRelative[]
  /** Relationship edges as ingester nodes (couples, child-parents, godparents). */
  edges: FsNode[]
}

// ---- Relatives snapshot ----------------------------------------------------
// What relatives each imported person had ON FAMILYSEARCH at import/sync time.
// The change scan flags a relative only if it is NOT in this snapshot (i.e. it
// appeared AFTER we last looked) — so re-scanning right after an import shows
// nothing, and out-of-scope relatives (beyond the depth/cap) are never flagged.
let relSnapshot: Record<string, string[]> | null = null
function loadRelSnapshot(): Record<string, string[]> {
  if (relSnapshot) return relSnapshot
  try {
    relSnapshot = JSON.parse(AppSettings.get('fs_rel_snapshot') ?? '{}') as Record<string, string[]>
  } catch {
    relSnapshot = {}
  }
  return relSnapshot
}
function saveRelSnapshot(): void {
  if (relSnapshot) AppSettings.set('fs_rel_snapshot', JSON.stringify(relSnapshot))
}
/** Record the CURRENT FamilySearch relatives of a person as "known". */
function recordKnownRelatives(fid: string, relativeFids: string[]): void {
  const m = loadRelSnapshot()
  m[fid] = [...new Set(relativeFids)]
}

/** Read /families for a person: spouses, children, parents (+ godparents when
 *  present) with display names, plus the relationship edges for ingest. */
async function fetchPersonFamilies(fid: string, treeId: string = 'GLOBAL'): Promise<FamiliesInfo> {
  await selectTree(treeId)
  const r = await gxGet(`/platform/tree/persons/${enc(fid)}/families`)
  const doc = r.doc
  if (!doc) return { relatives: [], edges: [] }
  const nameOfFid = new Map<string, string>()
  for (const gp of doc.persons ?? []) {
    if (gp.id) nameOfFid.set(gp.id, gp.display?.name ?? gp.id)
  }
  const rel: FsRelative[] = []
  const seen = new Set<string>()
  const add = (f: string | null | undefined, kind: FsRelative['kind']): void => {
    if (!f || f === fid || seen.has(`${kind}:${f}`)) return
    seen.add(`${kind}:${f}`)
    rel.push({ fid: f, name: nameOfFid.get(f) ?? f, kind })
  }
  const rid = (x?: { resourceId?: string; resource?: string }): string | null =>
    x?.resourceId ?? (x?.resource ? x.resource.replace(/^.*[/#]/, '') : null)
  for (const cr of doc.relationships ?? []) {
    const a = rid(cr.person1)
    const b = rid(cr.person2)
    if (cr.type?.endsWith('Couple')) {
      if (a === fid) add(b, 'spouse')
      if (b === fid) add(a, 'spouse')
    } else if (cr.type?.endsWith('Godparent')) {
      if (b === fid) add(a, 'godparent')
    }
  }
  for (const cap of doc.childAndParentsRelationships ?? []) {
    const c = rid(cap.child)
    const p1 = rid(cap.parent1)
    const p2 = rid(cap.parent2)
    if (c === fid) {
      add(p1, 'parent')
      add(p2, 'parent')
    }
    if (p1 === fid || p2 === fid) add(c, 'child')
  }
  const edges: FsNode[] = relationshipNodes(doc)
  for (const g of rel.filter((x) => x.kind === 'godparent')) {
    edges.push({ t: 'gp', c: fid, p: g.fid })
  }
  // Marriage facts live on the couple relationship, and the /families response
  // often omits them — fetch the couple-relationship details for this person's
  // couples that came through without a marriage fact.
  for (const cr of doc.relationships ?? []) {
    if (cr.type && !cr.type.endsWith('Couple')) continue
    const a = rid(cr.person1)
    const b = rid(cr.person2)
    if ((a !== fid && b !== fid) || !cr.id) continue
    const already = edges.some((e) => e.t === 'f' && ((e.a === a && e.b === b) || (e.a === b && e.b === a)) && (e.md || e.mp))
    if (already) continue
    const det = await gxGet(`/platform/tree/couple-relationships/${enc(cr.id)}`)
    if (det.doc) {
      for (const en of relationshipNodes(det.doc)) {
        if (en.t === 'f' && (en.md || en.mp)) edges.push(en)
      }
    }
  }
  return { relatives: rel, edges }
}

/** FS ids of everyone already linked to this LOCAL person (spouses, children,
 *  parents, godparents) — used to tell which FamilySearch relatives are new. */
function localRelativeFsIds(personId: string): Set<string> {
  const db = getDb()
  const out = new Set<string>()
  const add = (pid: string | null): void => {
    if (!pid) return
    const row = db.prepare('SELECT fs_id FROM people WHERE id = ?').get(pid) as
      | { fs_id: string | null }
      | undefined
    if (row?.fs_id) out.add(row.fs_id)
  }
  const fams = db
    .prepare('SELECT id, husband_id, wife_id FROM families WHERE husband_id = ? OR wife_id = ?')
    .all(personId, personId) as { id: string; husband_id: string | null; wife_id: string | null }[]
  for (const f of fams) {
    add(f.husband_id)
    add(f.wife_id)
    for (const c of db.prepare('SELECT child_id FROM family_children WHERE family_id = ?').all(f.id) as {
      child_id: string
    }[]) {
      add(c.child_id)
    }
  }
  const parents = db
    .prepare(
      'SELECT f.husband_id, f.wife_id FROM families f JOIN family_children fc ON fc.family_id = f.id WHERE fc.child_id = ?'
    )
    .all(personId) as { husband_id: string | null; wife_id: string | null }[]
  for (const f of parents) {
    add(f.husband_id)
    add(f.wife_id)
  }
  for (const g of db.prepare('SELECT godparent_id FROM godparents WHERE person_id = ?').all(personId) as {
    godparent_id: string
  }[]) {
    add(g.godparent_id)
  }
  return out
}

// ---- Full sync preview: fields + new relatives + content counts ------------
export interface FsContentCounts {
  notes: { local: number; remote: number }
  sources: { local: number; remote: number }
  media: { local: number; remote: number }
  occupations: { local: number; remote: number }
  events: { local: number; remote: number }
}
export interface FsSyncPreview {
  fields: FsFieldDiff[]
  newRelatives: FsRelative[]
  content: FsContentCounts
}

/** Everything a one-person sync would change: field diffs, brand-new relatives
 *  on FamilySearch, and how much extra content (notes/sources/photos/jobs)
 *  FamilySearch carries versus the local record. */
export async function familySearchSyncPreview(
  personId: string
): Promise<FsSyncPreview | { error: string }> {
  const diff = await familySearchPersonDiff(personId)
  if ('error' in diff) return diff
  const p = People.get(personId)
  if (!p?.fsId) return { error: 'NOT_LINKED' }

  const [fam, extras] = [await fetchPersonFamilies(p.fsId), await fetchPersonExtras(p.fsId)]
  const local = localRelativeFsIds(personId)
  // A relative counts as NEW only if it is neither local nor already known from
  // the import snapshot (out-of-scope relatives were known, so not "changes").
  const known = new Set(loadRelSnapshot()[p.fsId] ?? [])
  const newRelatives = fam.relatives.filter((r) => !local.has(r.fid) && !known.has(r.fid))

  const db = getDb()
  const cnt = (sql: string): number =>
    ((db.prepare(sql).get(personId) as { n: number } | undefined)?.n ?? 0)
  const doc = await getPersonDoc(p.fsId)
  const gp = doc?.persons?.find((x) => x.id === p.fsId) ?? doc?.persons?.[0]
  const remoteOcc = gp?.facts?.filter((f) => f.type === GX + 'Occupation').length ?? 0

  // NOTE: notes and media are stored differently from a raw count (notes live
  // in the person's `notes` text column, not note_links), so a naive COUNT
  // mismatches forever. Compare by CONTENT — only genuinely-missing remote
  // items count, so applying a pull actually clears the flag.
  const localNotesText = (p.notes ?? '').trim()
  const notesMissing = extras.notes.filter((nt) => {
    const t = nt.trim()
    return t.length > 0 && !localNotesText.includes(t)
  }).length

  // Media: dedupe remote against local by the content-derived doc id (same key
  // the importer uses), so re-scanning already-imported photos never re-flags.
  const localDocKeys = new Set(
    (db.prepare('SELECT document_id FROM person_documents WHERE person_id = ?').all(personId) as { document_id: string }[]).map(
      (r) => r.document_id
    )
  )
  const mediaMissing = extras.media.filter((m) => !localDocKeys.has(mediaDocId(m.u))).length

  const localSrc = cnt("SELECT COUNT(*) AS n FROM citations WHERE owner_type='person' AND owner_id = ?")
  const localOcc = cnt('SELECT COUNT(*) AS n FROM occupations WHERE person_id = ?')
  const localEv = cnt("SELECT COUNT(*) AS n FROM events WHERE owner_type='person' AND owner_id = ?")
  const remoteEv = gp ? (personToNode(gp) as { ev?: unknown[] } | null)?.ev?.length ?? 0 : 0

  const content: FsContentCounts = {
    // local = remote - missing, so the scan flags ONLY when something is missing.
    notes: { local: extras.notes.length - notesMissing, remote: extras.notes.length },
    media: { local: extras.media.length - mediaMissing, remote: extras.media.length },
    sources: { local: Math.min(localSrc, extras.sources.length), remote: extras.sources.length },
    occupations: { local: Math.min(localOcc, remoteOcc), remote: remoteOcc },
    events: { local: Math.min(localEv, remoteEv), remote: remoteEv }
  }
  return { fields: diff.pull, newRelatives, content }
}

/** Pull the NEW FamilySearch relatives of one person into the local tree:
 *  each new relative arrives complete (record + portrait + notes + sources),
 *  then the family edges are wired up. Returns the new relatives added. */
export async function syncPersonRelatives(
  personId: string
): Promise<{ added: FsRelative[]; nodes: FsNode[] }> {
  const p = People.get(personId)
  if (!p?.fsId) return { added: [], nodes: [] }
  const fam = await fetchPersonFamilies(p.fsId)
  // Everything FamilySearch currently has around this person is now "known".
  recordKnownRelatives(p.fsId, fam.relatives.map((r) => r.fid))
  saveRelSnapshot()
  const local = localRelativeFsIds(personId)
  const fresh = fam.relatives.filter((r) => !local.has(r.fid))
  const nodes: FsNode[] = []
  for (const r of fresh) {
    const doc = await getPersonDoc(r.fid)
    const gp = doc?.persons?.find((x) => x.id === r.fid) ?? doc?.persons?.[0]
    const n = gp ? personToNode(gp) : null
    if (!n || n.t !== 'i') continue
    const extras = await fetchPersonExtras(r.fid)
    if (extras.media.length) n.media = extras.media
    if (extras.notes.length) n.no = extras.notes
    nodes.push(n, ...extras.sources)
  }
  nodes.push(...fam.edges)
  return { added: fresh, nodes }
}


// ---- FamilySearch Places (place authority) ----------------------------------
/** Place search against the FamilySearch Places authority — used INSTEAD of
 *  the public geocoder whenever the user is signed in (FS mode), both for the
 *  place-autocomplete fields and the batch geocoding. */
export async function searchFamilySearchPlaces(
  query: string
): Promise<{ name: string; lat: number; lon: number }[]> {
  if (!cachedToken) return []
  const q = query.trim()
  if (q.length < 2) return []
  await throttle()
  try {
    const res = await fetch(
      `${API}/platform/places/search?q=${enc(`partialName:${q}`)}&count=8`,
      {
        headers: {
          Authorization: `Bearer ${cachedToken}`,
          Accept: 'application/x-gedcomx-atom+json',
          'User-Agent': USER_AGENT,
          'Accept-Language': placeLang()
        }
      }
    )
    if (!res.ok) return []
    const data = (await res.json()) as {
      entries?: {
        content?: {
          gedcomx?: {
            places?: {
              latitude?: number
              longitude?: number
              display?: { fullName?: string; name?: string }
              names?: { value?: string }[]
            }[]
          }
        }
      }[]
    }
    const out: { name: string; lat: number; lon: number }[] = []
    for (const e of data.entries ?? []) {
      for (const pl of e.content?.gedcomx?.places ?? []) {
        const name = pl.display?.fullName ?? pl.display?.name ?? pl.names?.[0]?.value
        if (!name) continue
        const lat = Number(pl.latitude)
        const lon = Number(pl.longitude)
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
        if (!out.some((x) => x.name === name)) out.push({ name, lat, lon })
      }
    }
    return out
  } catch {
    return []
  }
}

// ---- FamilySearch Date authority --------------------------------------------
const dateCache = new Map<string, string | null>()

/** Normalize a free-text date via the FamilySearch Date authority, in the
 *  user's UI language (Accept-Language governs the output format). Returns the
 *  normalized text, or null when the authority cannot parse it. */
export async function normalizeDateViaFamilySearch(text: string, lang: string): Promise<string | null> {
  if (!cachedToken) return null
  const raw = text.trim()
  if (!raw) return null
  const key = `${lang}:${raw.toLowerCase()}`
  if (dateCache.has(key)) return dateCache.get(key) ?? null
  await throttle()
  try {
    const res = await fetch(`${API}/platform/dates?date=${enc(raw)}`, {
      headers: {
        Authorization: `Bearer ${cachedToken}`,
        Accept: 'application/json',
        'Accept-Language': lang,
        'User-Agent': USER_AGENT
      }
    })
    if (!res.ok) {
      dateCache.set(key, null)
      return null
    }
    const data = (await res.json()) as {
      dates?: { normalized?: { lang?: string; value?: string }[]; original?: string }[]
    }
    const d = data.dates?.[0]
    const normalized =
      d?.normalized?.find((n) => n.lang && lang.startsWith(n.lang))?.value ??
      d?.normalized?.[0]?.value ??
      null
    dateCache.set(key, normalized)
    return normalized
  } catch {
    return null
  }
}

/** Extra headers for fetching a media URL: FamilySearch-hosted images require
 *  the OAuth bearer token (401 without it). Other hosts get nothing extra. */
export function mediaAuthHeaders(url: string): Record<string, string> {
  loadTokens()
  try {
    const host = new URL(url).hostname
    if (host.endsWith('familysearch.org') && cachedToken) {
      return { Authorization: `Bearer ${cachedToken}` }
    }
  } catch {
    /* not a URL */
  }
  return {}
}
