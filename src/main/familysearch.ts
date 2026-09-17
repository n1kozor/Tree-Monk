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
import { app, safeStorage, shell } from 'electron'
import { createServer, type Server } from 'http'
import { createHash, randomBytes } from 'crypto'
import { wipeDatabase } from './db/admin'
import { AppSettings, Citations, Documents, Events, Occupations, People, Places } from './db/repo'
import { readFile } from 'fs/promises'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join as joinPath } from 'path'
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
import { DEFAULT_IMPORT_PERSONS, MAX_IMPORT_PERSONS } from '@shared/familysearch'
import { canonicalizeCountryInPlace } from '@shared/placeNormalize'

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
const USER_AGENT = `TreeMonk/${app.getVersion()} (+https://treemonk.eu)`

export function isFamilySearchConfigured(): boolean {
  return !!FS_CLIENT_ID
}

// ---- Token state (access ~24h, refresh ~90d if granted). Persisted across
// restarts, encrypted with the OS keychain (safeStorage) when available.
// GLOBAL, file-based storage: the FamilySearch session belongs to the USER,
// not to a tree. It used to live in the per-workspace database — with several
// trees the app could start on a workspace without the tokens and look
// spontaneously signed out. The legacy per-workspace value is adopted once. --
let cachedToken: string | null = null
let cachedRefresh: string | null = null
/** When the access token was ISSUED. FamilySearch kills it 24 hours later (and
 *  this flow gets no refresh token), so the age alone proves an overnight token
 *  dead — without it, `isSignedIn()` kept vouching for a corpse. */
let cachedIssuedAt: number | null = null
let tokensLoaded = false

function sessionFile(): string {
  return joinPath(app.getPath('userData'), 'fs-session.bin')
}

function encodeTokens(): string {
  const payload = JSON.stringify({ a: cachedToken, r: cachedRefresh, t: cachedIssuedAt })
  if (safeStorage.isEncryptionAvailable()) {
    return 'enc:' + safeStorage.encryptString(payload).toString('base64')
  }
  // No OS keychain (rare) — store obfuscated; the access token expires in 24h.
  return 'b64:' + Buffer.from(payload).toString('base64')
}

function decodeTokens(raw: string): void {
  const payload = raw.startsWith('enc:')
    ? safeStorage.decryptString(Buffer.from(raw.slice(4), 'base64'))
    : raw.startsWith('b64:')
      ? Buffer.from(raw.slice(4), 'base64').toString('utf8')
      : null
  if (!payload) return
  const t = JSON.parse(payload) as { a?: string | null; r?: string | null; t?: number | null }
  cachedToken = t.a ?? null
  cachedRefresh = t.r ?? null
  // Age-less legacy session files stay valid until a live call rules on them.
  cachedIssuedAt = typeof t.t === 'number' ? t.t : null
}

function persistTokens(): void {
  try {
    writeFileSync(sessionFile(), encodeTokens(), 'utf8')
  } catch {
    /* persistence is best-effort */
  }
}

function loadTokens(): void {
  if (tokensLoaded) return
  tokensLoaded = true
  try {
    if (existsSync(sessionFile())) {
      decodeTokens(readFileSync(sessionFile(), 'utf8'))
      return
    }
    // Legacy location (per-workspace DB) → adopt into the global file once.
    const legacy = AppSettings.get('fs_tokens')
    if (legacy) {
      decodeTokens(legacy)
      if (cachedToken) persistTokens()
    }
  } catch {
    /* corrupted/undecryptable → start signed out */
  }
}

function clearTokens(): void {
  cachedToken = null
  cachedRefresh = null
  cachedIssuedAt = null
  try {
    if (existsSync(sessionFile())) unlinkSync(sessionFile())
  } catch {
    /* ignore */
  }
  try {
    AppSettings.set('fs_tokens', null)
  } catch {
    /* the legacy per-workspace slot is best-effort */
  }
}

export function getCachedToken(): string | null {
  loadTokens()
  return cachedToken
}
/** FamilySearch access tokens hard-expire 24 h after issue; report signed-out a
 *  few minutes early so nobody starts an import on a token about to die. */
const TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000 - 5 * 60 * 1000

export function isSignedIn(): boolean {
  loadTokens()
  if (!cachedToken) return false
  // A token past its lifetime is dead with certainty — saying "signed in" here
  // is what let the user configure a whole import that could only fail (or,
  // with replace mode, wipe the tree first). Age-less legacy files pass; the
  // pre-import probe rules on those.
  return cachedIssuedAt === null || Date.now() - cachedIssuedAt < TOKEN_LIFETIME_MS
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
  },
  fr: {
    okTitle: 'Connexion réussie à FamilySearch',
    okMsg: 'Vous êtes connecté(e). Vous pouvez fermer cet onglet et retourner dans TreeMonk.',
    errTitle: 'Échec de la connexion',
    errMsg: 'Une erreur est survenue. Fermez cet onglet et réessayez dans TreeMonk.'
  },
  it: {
    okTitle: 'Accesso a FamilySearch riuscito',
    okMsg: 'Sei connesso. Puoi chiudere questa scheda e tornare a TreeMonk.',
    errTitle: 'Accesso non riuscito',
    errMsg: 'Qualcosa è andato storto. Chiudi questa scheda e riprova in TreeMonk.'
  },
  es: {
    okTitle: 'Sesión iniciada en FamilySearch',
    okMsg: 'Has iniciado sesión. Puedes cerrar esta pestaña y volver a TreeMonk.',
    errTitle: 'Error al iniciar sesión',
    errMsg: 'Algo salió mal. Cierra esta pestaña e inténtalo de nuevo en TreeMonk.'
  },
  ru: {
    okTitle: 'Вход в FamilySearch выполнен',
    okMsg: 'Вы вошли в систему. Можно закрыть эту вкладку и вернуться в TreeMonk.',
    errTitle: 'Не удалось войти',
    errMsg: 'Что-то пошло не так. Закройте эту вкладку и попробуйте снова в TreeMonk.'
  },
  pl: {
    okTitle: 'Zalogowano do FamilySearch',
    okMsg: 'Jesteś zalogowany/a. Możesz zamknąć tę kartę i wrócić do TreeMonk.',
    errTitle: 'Logowanie nie powiodło się',
    errMsg: 'Coś poszło nie tak. Zamknij tę kartę i spróbuj ponownie w TreeMonk.'
  },
  pt: {
    okTitle: 'Sessão iniciada no FamilySearch',
    okMsg: 'Você está conectado. Pode fechar esta guia e voltar ao TreeMonk.',
    errTitle: 'Falha ao entrar',
    errMsg: 'Algo deu errado. Feche esta guia e tente novamente no TreeMonk.'
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
        cachedIssuedAt = Date.now()
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
 *  refresh tokens; public clients often are not, in which case re-login).
 *
 *  SINGLE-FLIGHT: with several requests in parallel, an expired token produces
 *  a burst of simultaneous 401s — every caller must share ONE refresh attempt.
 *  Racing refreshes would each spend the (possibly rotating) refresh token:
 *  the losers came back invalid and wiped the winner's fresh session, which
 *  showed up as a spontaneous sign-out. */
let refreshFlight: Promise<boolean> | null = null
async function tryRefresh(): Promise<boolean> {
  if (refreshFlight) return refreshFlight
  if (!cachedRefresh) return false
  refreshFlight = (async () => {
    const toks = await tokenRequest(
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: FS_CLIENT_ID,
        refresh_token: cachedRefresh!
      })
    )
    if (!toks) {
      cachedRefresh = null
      return false
    }
    cachedToken = toks.access
    cachedRefresh = toks.refresh ?? cachedRefresh
    cachedIssuedAt = Date.now()
    persistTokens()
    return true
  })()
  // Late arrivals within the next second share this flight's outcome instead
  // of immediately spending the fresh refresh token again.
  void refreshFlight.finally(() => setTimeout(() => { refreshFlight = null }, 1000))
  return refreshFlight
}

async function tokenRequest(
  body: URLSearchParams
): Promise<{ access: string; refresh: string | null } | null> {
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
      body,
      // A stuck token refresh would freeze every caller waiting on it.
      signal: AbortSignal.timeout(30_000)
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

// ---- API layer (bearer + GEDCOM-X + scheduler + 401-refresh) ----------------
// SELF-TUNING scheduler. FamilySearch does not throttle on request COUNT: the
// published policy budgets server PROCESSING TIME per window (their example is
// 18 s of execution per minute), it applies per USER across every product they
// have open, and different endpoints get different windows. That budget is not
// something a client can compute up front — so instead of guessing a fixed
// rate, this probes for it: speed up while everything succeeds, halve hard the
// moment a 429 arrives (additive increase / multiplicative decrease). The
// result settles just under whatever the real limit happens to be right now.
const CONCURRENCY_FLOOR = 2
const CONCURRENCY_CEILING = 16
const SPACING_FLOOR = 15 // ms between request STARTS, fastest
const SPACING_CEILING = 400 // …and slowest, after repeated push-back
const SPEEDUP_AFTER = 25 // clean responses before taking one more slot

let maxConcurrent = 6
let spacing = 60
let okStreak = 0
let activeReqs = 0
let lastStart = 0
let backoffUntil = 0
const reqQueue: (() => void)[] = []

/** Rolling 60 s window of server-reported processing time (X-PROCESSING-TIME).
 *  Not used to gate requests — the 429 feedback loop does that far more
 *  reliably — but it is the only view we have of the actual budget spend. */
const procWindow: { at: number; ms: number }[] = []

function notePace(res: Response): void {
  const now = Date.now()
  const ms = Number(res.headers.get('X-PROCESSING-TIME'))
  if (Number.isFinite(ms) && ms > 0) procWindow.push({ at: now, ms })
  while (procWindow.length && now - procWindow[0].at > 60_000) procWindow.shift()

  if (res.status === 429) {
    // Multiplicative decrease: back off hard, and stay backed off.
    okStreak = 0
    maxConcurrent = Math.max(CONCURRENCY_FLOOR, Math.floor(maxConcurrent / 2))
    spacing = Math.min(SPACING_CEILING, Math.max(spacing * 2, 60))
    return
  }
  if (!res.ok) return
  // Additive increase: reclaim throughput slowly, a slot at a time, then by
  // shaving the gap between starts.
  if (++okStreak >= SPEEDUP_AFTER) {
    okStreak = 0
    if (maxConcurrent < CONCURRENCY_CEILING) maxConcurrent++
    else if (spacing > SPACING_FLOOR) spacing = Math.max(SPACING_FLOOR, spacing - 5)
    pumpQueue()
  }
}

/** Live view of the pacing loop — surfaced for diagnostics. */
export function familySearchPaceStats(): {
  concurrency: number
  spacingMs: number
  processingMsLastMinute: number
  requestsLastMinute: number
} {
  const now = Date.now()
  const recent = procWindow.filter((e) => now - e.at <= 60_000)
  return {
    concurrency: maxConcurrent,
    spacingMs: spacing,
    processingMsLastMinute: Math.round(recent.reduce((n, e) => n + e.ms, 0)),
    requestsLastMinute: recent.length
  }
}

function pumpQueue(): void {
  if (activeReqs >= maxConcurrent || reqQueue.length === 0) return
  const now = Date.now()
  const at = Math.max(lastStart + spacing, backoffUntil)
  if (at > now) {
    setTimeout(pumpQueue, at - now)
    return
  }
  lastStart = now
  activeReqs++
  reqQueue.shift()!()
  if (reqQueue.length) pumpQueue()
}

function acquireSlot(): Promise<void> {
  return new Promise((r) => {
    reqQueue.push(r)
    pumpQueue()
  })
}
function releaseSlot(): void {
  activeReqs = Math.max(0, activeReqs - 1)
  pumpQueue()
}
/** Pause ALL request starts (all workers) — used on 429/5xx. */
function backOff(ms: number): void {
  backoffUntil = Math.max(backoffUntil, Date.now() + ms)
}
function retryAfterMs(res: Response, attempt: number): number {
  const ra = Number(res.headers.get('Retry-After'))
  return Number.isFinite(ra) && ra > 0 ? ra * 1000 : 2000 * (attempt + 1)
}
/**
 * Hard ceiling for a single API call. Without it a socket that never answers
 * holds BOTH its scheduler slot and its traversal worker forever: the other
 * workers keep spinning because `busyWorkers` never drops, the import promise
 * never settles, and the UI shows a spinner that can never finish. A timeout
 * turns that permanent hang into one skipped request.
 */
const REQUEST_TIMEOUT_MS = 60_000

/** One scheduled fetch: waits for a slot, runs, frees the slot. */
async function schedFetch(url: string, init: RequestInit): Promise<Response> {
  await acquireSlot()
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    notePace(res)
    return res
  } finally {
    releaseSlot()
  }
}

async function gxGet(
  path: string,
  media: string = GX_MEDIA
): Promise<{ status: number; doc: GxDocument | null; location?: string }> {
  loadTokens()
  if (!cachedToken) return { status: 401, doc: null }
  // Remembered so an exhausted retry loop can say WHY it gave up instead of
  // reporting a bare 429 that never happened.
  let lastError: string | null = null
  for (let attempt = 0; attempt < 4; attempt++) {
    const tokenUsed: string | null = cachedToken
    let res: Response
    try {
      res = await schedFetch(API + path, {
        redirect: 'manual',
        headers: {
          Authorization: `Bearer ${tokenUsed}`,
          Accept: media,
          'User-Agent': USER_AGENT,
          // Node's fetch defaults to "accept-language: *", which the Family Tree
          // WRITE upstream rejects with 400 — always send a concrete language.
          'Accept-Language': 'en'
        }
      })
    } catch (err) {
      // Timed out or the connection dropped. Retry a few times before giving
      // up — a single flaky request must not cost the person, and must never
      // stall the whole import.
      lastError = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      // eslint-disable-next-line no-console
      console.error('[fs] GET', path, `attempt ${attempt + 1}/4 failed —`, lastError)
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
      continue
    }
    if (res.status === 401 && attempt === 0 && (await tryRefresh())) continue
    if (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) {
      const wait = retryAfterMs(res, attempt)
      backOff(wait)
      await new Promise((r) => setTimeout(r, wait))
      continue
    }
    if (res.status === 204) return { status: 204, doc: null }
    if (res.status >= 300 && res.status < 400) {
      return { status: res.status, doc: null, location: res.headers.get('Location') ?? undefined }
    }
    if (res.status === 401) {
      // A parallel caller may have refreshed the session while this request was
      // in flight — retry with the fresh token instead of killing the session.
      if (cachedToken && cachedToken !== tokenUsed && attempt < 3) continue
      // Expired and unrefreshable → sign out cleanly so the UI prompts again.
      clearTokens()
      return { status: 401, doc: null }
    }
    if (!res.ok) {
      // A 404 on a person's SUB-collection is FamilySearch's way of saying "this
      // person has none" — most people have no discussions/memories/sources, so
      // logging those would flood the console with hundreds of non-errors per
      // import. Only genuine failures are reported.
      if (res.status === 404 && /\/(discussion-references|memories|notes|sources|portrait)$/.test(path)) {
        return { status: res.status, doc: null }
      }
      // eslint-disable-next-line no-console
      console.error('[fs] GET', path, '→', res.status, (await res.text().catch(() => '')).slice(0, 200))
      return { status: res.status, doc: null }
    }
    const doc = (await res.json().catch(() => null)) as GxDocument | null
    return { status: res.status, doc }
  }
  if (lastError) {
    // eslint-disable-next-line no-console
    console.error('[fs] GET', path, 'gave up after 4 attempts —', lastError)
    return { status: 0, doc: null }
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
    const tokenUsed: string | null = cachedToken
    let res: Response
    try {
      res = await schedFetch(API + path, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          Authorization: `Bearer ${tokenUsed}`,
          'Content-Type': media,
          Accept: media,
          'User-Agent': USER_AGENT,
          // undici would default to "accept-language: *" → TF write upstream 400.
          'Accept-Language': 'en',
          ...(reason ? { 'X-Reason': reason } : {})
        },
        body: JSON.stringify(body)
      })
    } catch {
      // A WRITE is NOT retried on a timeout: the server may already have
      // applied it, and a second POST would duplicate the conclusion. Fail
      // loudly instead and let the caller decide.
      return { status: 0, error: 'NETWORK' }
    }
    if (res.status === 401 && attempt === 0 && (await tryRefresh())) continue
    if (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) {
      // Throttled or the service is momentarily unavailable — back off and retry.
      const wait = retryAfterMs(res, attempt)
      backOff(wait)
      await new Promise((r) => setTimeout(r, wait))
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
      // A parallel caller may have refreshed the session mid-flight — retry
      // with the fresh token instead of killing the session.
      if (cachedToken && cachedToken !== tokenUsed && attempt < 3) continue
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
// PRODUCTION has no user-tree switching: everything IS the shared Family Tree,
// and POSTing /platform/trees/current there just wastes a round-trip per call
// (or errors) — so tree selection is a no-op outside beta.
let currentTree: string | null = null

async function selectTree(treeId: string): Promise<boolean> {
  if (!BETA) return true
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
  // Personal trees (groups carrying treeIds) are a beta-environment feature;
  // production works against the one shared Family Tree only.
  if (!BETA) return trees
  try {
    const res = await schedFetch(`${API}/platform/groups`, {
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
  /** GEDCOM X: the time period the source COVERS — i.e. the record's own date.
   *  For an INDEXED record the date is also spelled out in the citation text, so
   *  ignoring this field went unnoticed. An UNINDEXED source (a film/catalog
   *  image attached by hand) has no citation text at all, so this is the only
   *  date FamilySearch ever ships for it. */
  coverage?: { temporal?: { original?: string; formal?: string } }[]
}
interface GxExtrasDoc {
  sourceDescriptions?: GxSourceDescription[]
  persons?: (GxPerson & { notes?: { subject?: string; text?: string }[] })[]
}

export interface PersonExtras {
  media: { u: string; t: string | null; p?: 1 }[]
  notes: string[]
  sources: FsNode[]
  /** FamilySearch "Collaborate" discussions attached to the person. */
  di: { id?: string | null; ti?: string | null; bo?: string; cr?: number | null }[]
}

/**
 * The cited record's OWN date, when the source description carries one.
 *
 * MEASURED, not assumed: FamilySearch's platform API does NOT expose a source
 * date. A source created in their web UI *with* a date comes back as nothing
 * but `{attribution, id, lang, links, resourceType, titles}` — verified against
 * both `/persons/{id}/sources` and `/sources/descriptions/{id}`, in both the
 * GEDCOM X and the FamilySearch media type. The date column their UI shows is
 * the date of the EVENT a source is tagged to, not a property of the source,
 * and the tagging is not exposed either.
 *
 * `coverage.temporal` is still read because it is the standard GEDCOM X place
 * for it and costs nothing — if FamilySearch (or another producer) ever fills
 * it in, dates start appearing with no further work. Their `sortKey` is NOT
 * consulted: it is an ordinal ("0000000001"), never a date.
 */
function sourceRecordDate(d: GxSourceDescription): string | null {
  const YEAR = /\b(1[5-9]\d{2}|20\d{2})\b/
  for (const c of d.coverage ?? []) {
    const t = c.temporal
    if (!t) continue
    // GEDCOM X formal dates read "+1957-12-17"; ranges are "start/end".
    const formal = (t.formal ?? '').split('/')[0].replace(/^\+/, '').trim()
    if (formal && YEAR.test(formal)) return formal
    const original = (t.original ?? '').trim()
    if (original && YEAR.test(original)) return original
  }
  return null
}

/**
 * Which kind of record a citation describes, as a GEDCOM event tag.
 *
 * FamilySearch's own citation text for a BROWSED (unindexed) image names the
 * register it came from, in English, regardless of the interface language:
 *
 *   … Heves > Tarnabod > Births (Születtek) 1909-1913 > image 5 of 37 …
 *   … Heves > Csány    > Marriages (Házasultak) 1929-1942 > image 108 …
 *
 * That word is the one solid fact such a source carries beyond its title, and
 * it is what lets the app tie the source to the right event — which in turn is
 * how a date can be shown for records FamilySearch dates in its own UI but does
 * not expose through the API.
 */
function citationEventTag(text: string | null | undefined): string | null {
  if (!text) return null
  // Match the register name as it appears between the "…" path separators.
  const m = /\b(Births?|Christenings?|Baptisms?|Marriages?|Deaths?|Burials?)\b/i.exec(text)
  if (!m) return null
  const w = m[1].toLowerCase()
  if (w.startsWith('birth')) return 'BIRT'
  if (w.startsWith('christening') || w.startsWith('baptism')) return 'CHR'
  if (w.startsWith('marriage')) return 'MARR'
  if (w.startsWith('death')) return 'DEAT'
  if (w.startsWith('burial')) return 'BURI'
  return null
}

/** FamilySearch memory-artifact id from a media URL (both the portrait redirect
 *  and the memory image links carry /artifacts/{id}/) — used to recognise that
 *  the portrait IS one of the memories, so the same photo is never filed twice. */
function artifactIdOf(url: string): string | null {
  const m = /\/artifacts\/(\d+)/.exec(url)
  return m ? m[1] : null
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
  const media: { u: string; t: string | null; p?: 1 }[] = []
  const notes: string[] = []
  const sources: FsNode[] = []
  const di: PersonExtras['di'] = []

  // Fetch all extras concurrently (throttle-bound, but overlaps network
  // latency — much faster than one after another).
  const [por, mem, not, src, dref] = await Promise.all([
    gxGet(`/platform/tree/persons/${enc(fid)}/portrait`),
    gxGet(`/platform/tree/persons/${enc(fid)}/memories`),
    gxGet(`/platform/tree/persons/${enc(fid)}/notes`),
    gxGet(`/platform/tree/persons/${enc(fid)}/sources`),
    gxGet(`/platform/tree/persons/${enc(fid)}/discussion-references`, FS_MEDIA)
  ])

  // Discussions ("Collaborate" tab): references first, then each discussion's
  // title/details. Most persons have none, so this usually costs nothing.
  interface DiscussionRef {
    resource?: string
    resourceId?: string
  }
  interface DiscussionDoc {
    discussions?: { id?: string; title?: string; details?: string; created?: number | string }[]
  }
  const refs =
    ((dref.doc as unknown as { persons?: { 'discussion-references'?: DiscussionRef[] }[] } | null)?.persons?.[0]?.[
      'discussion-references'
    ] ?? [])
      .map((r) => r.resourceId ?? (r.resource ? r.resource.replace(/^.*\/discussions\//, '').replace(/[/?].*$/, '') : null))
      .filter((x): x is string => !!x)
      .slice(0, 10)
  for (const id of refs) {
    const d = await gxGet(`/platform/discussions/${enc(id)}`, FS_MEDIA)
    const disc = (d.doc as unknown as DiscussionDoc | null)?.discussions?.[0]
    if (!disc) continue
    const created =
      typeof disc.created === 'number'
        ? disc.created
        : disc.created
          ? Date.parse(disc.created) || null
          : null
    di.push({ id: disc.id ?? id, ti: disc.title ?? null, bo: disc.details ?? '', cr: created })
  }

  // Memories: photos / document scans / stories attached to the person.
  for (const d of ((mem.doc as unknown as GxExtrasDoc | null)?.sourceDescriptions ?? [])) {
    const url = d.links?.image?.href ?? d.links?.['image-thumbnail']?.href ?? d.about
    if (url && !media.some((m) => m.u === url)) {
      media.push({ u: url, t: d.titles?.[0]?.value ?? null })
    }
  }

  // Portrait: a 307 redirect carries the image URL in Location. The portrait is
  // usually one of the memories cropped — recognise that by the shared artifact
  // id and mark THAT memory as the portrait instead of filing the same photo
  // twice. Only a portrait with no matching memory is added as its own entry.
  if (por.location) {
    const aid = artifactIdOf(por.location)
    const twin = aid ? media.find((m) => artifactIdOf(m.u) === aid) : undefined
    if (twin) twin.p = 1
    else media.unshift({ u: por.location, t: null, p: 1 })
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
      dt: sourceRecordDate(d),
      // Which event this record documents. Lets the source sit under the right
      // fact on the profile, and gives an undated (browsed-image) source a date
      // to show — the date of that very event.
      ft: citationEventTag(d.citations?.[0]?.value) ?? undefined,
      // The record's own URL goes into the note — the sources panel renders
      // URLs as clickable links, so the user can open the original record.
      no: [d.notes?.[0]?.text, d.about].filter(Boolean).join('\n') || null
    })
  }

  return { media, notes, sources, di }
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
        if (extras.di.length) n.di = extras.di
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
  try {
    const res = await schedFetch(API + path, {
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
/** HTTP status of the last `current-person` attempt — so a failure to resolve
 *  the starting person can name its cause instead of dying anonymously. */
let lastRootStatus = 0

async function resolveRoot(root?: string): Promise<string | null> {
  await selectTree('GLOBAL')
  if (root) return root
  const r = await gxGet('/platform/tree/current-person')
  lastRootStatus = r.status
  if (r.location) return r.location.replace(/^.*\/persons\//, '').replace(/[/?].*$/, '')
  if (r.doc?.persons?.[0]?.id) return r.doc.persons[0].id
  // eslint-disable-next-line no-console
  console.error('[fs] current-person returned', r.status, '- no person id and no redirect')
  return null
}

/**
 * The one failure the user can fix entirely on their own is a dead session, so
 * it carries a machine-readable marker: the renderer looks for it and answers
 * with a localized "sign in again" toast plus a signed-out UI, instead of the
 * generic import-failed state whose real cause only the dev console ever saw.
 */
export const FS_SESSION_EXPIRED = 'FS_SESSION_EXPIRED'

function rootFailure(): Error {
  const code = lastRootStatus === 401 ? `${FS_SESSION_EXPIRED}: ` : ''
  return new Error(`${code}Could not determine the starting person: ${rootFailureReason(lastRootStatus)}.`)
}

/** Turns the bare status into something a user (or a bug report) can act on. */
function rootFailureReason(status: number): string {
  if (status === 401) return 'the FamilySearch session expired — sign out and sign in again'
  if (status === 429) return 'FamilySearch is rate-limiting this account — try again in a few minutes'
  if (status === 0) return 'FamilySearch could not be reached (network or timeout)'
  if (status === 403) return 'this FamilySearch account is not allowed to read the Family Tree'
  return `FamilySearch answered HTTP ${status}`
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
  } else {
    // An EXPLICIT root skips the server round-trip that would expose a dead
    // session — probe once so the failure happens cleanly, up front.
    const probe = await gxGet('/platform/tree/current-person')
    if (probe.status === 401) {
      lastRootStatus = 401
      throw rootFailure()
    }
  }
  if (!root) {
    throw rootFailure()
  }

  // Destroying anything is only safe NOW, with the session provably alive.
  // This used to run FIRST — an expired session in replace mode wiped the
  // database and then failed, leaving the user with an empty tree.
  if (opts.replace === true) wipeDatabase()
  relSnapshot = null // reload the relatives snapshot from the (possibly wiped) DB

  status(onStatus, 'fetching_root')
  // BFS from the starting person over /families, so EVERY person is fully
  // fetched before any relationship edge is emitted — guaranteeing no empty
  // stub is ever created. Ancestors go up (ascend), descendants go down
  // (descend); each person's spouse(s) and the root's children/marriages are
  // always included.
  const ascend = Math.max(0, opts.ascend ?? 4)
  const descend = Math.max(0, opts.childrenDepth ?? 2)
  // Side branches (siblings of ancestors, their children, cousins…) are their
  // OWN setting. They used to share the `descend` number, which is why a
  // seemingly harmless "descendants = 10" quietly meant "cousins ten levels
  // out from every ancestor" and pulled in tens of thousands of people.
  const collateral = Math.max(0, opts.depth ?? 1)

  // Hard ceiling for this edition. Clamped HERE, not just in the dialog, so a
  // remembered setting from an older version (or any other caller) can never
  // start an import that runs for hours.
  const maxPersons = Math.min(MAX_IMPORT_PERSONS, Math.max(1, opts.maxPersons ?? DEFAULT_IMPORT_PERSONS))

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
    /** Collateral chain length below the direct line (sibling of an ancestor = 1,
     *  their child = 2, …) — bounded by the descend setting, so the side pull
     *  can't cascade past what the user configured. */
    side: number
  }
  const gen = new Map<string, number>()
  const role = new Map<string, Role>()
  const allEdges: FsNode[] = []
  /**
   * Couple relationships seen anywhere during the walk. `allEdges` is drained as
   * edges are flushed, so the ids are captured HERE, where they arrive — for
   * free, no extra request. The enrichment pass then pulls the notes written
   * about the couple itself.
   */
  const couples = new Map<string, { a: string; b: string }>()
  const pq: Item[] = [{ fid: root, gen: 0, role: 'root', prio: 0, side: 0 }]
  gen.set(root, 0)
  role.set(root, 'root')

  const consider = (fid: string, g: number, rl: Role, prio: number, side = 0): void => {
    if (gen.has(fid)) return
    if (gen.size >= maxPersons) return // person cap reached — stop widening
    gen.set(fid, g)
    role.set(fid, rl)
    pq.push({ fid, gen: g, role: rl, prio, side })
  }

  // SINGLE-PASS streaming: each popped person is fetched COMPLETELY (record +
  // portrait + notes + sources) and emitted IMMEDIATELY, then their /families
  // edges are queued. After every person, any queued edge whose endpoints are
  // all already emitted is flushed — so the tree visibly grows person by person
  // AND the relationships wire up live, not in one burst at the end.
  status(onStatus, 'ancestors')

  // BULK PRELOAD of the direct line. `/platform/tree/ancestry` returns up to
  // eight generations in ONE response, with full person details — so the whole
  // ancestral backbone costs a single request instead of one per person. Only
  // the details themselves are trusted: if the server answers with summaries
  // (the detail flag has changed name across API versions) the cache stays
  // empty and every person is fetched individually exactly as before.
  const preloaded = new Map<string, GxPerson>()
  if (ascend > 0) {
    const gens = Math.min(MAX_GEN, Math.max(1, ascend))
    const anc = await gxGet(
      `/platform/tree/ancestry?person=${enc(root)}&generations=${gens}&personDetails=true`
    )
    for (const p of anc.doc?.persons ?? []) {
      if (p.id && p.names?.length) preloaded.set(p.id, p)
    }
  }

  const emitted = new Set<string>()
  const edgeSeen = new Set<string>()
  let processed = 0

  // The key includes the marriage payload for couple edges: the same pair can
  // legitimately arrive once bare (from /families) and once enriched with the
  // marriage facts (from the couple-relationship detail) — the ingester merges
  // them non-destructively, so both must pass; only true copies collapse.
  const edgeKey = (e: FsNode): string =>
    e.t === 'f'
      ? 'f:' + [e.a, e.b].sort().join('|') + `:${e.md ?? ''}|${e.mp ?? ''}|${e.mn ?? ''}`
      : e.t === 'c'
        ? `c:${[e.f ?? '', e.m ?? ''].sort().join('|')}>${e.c}`
        : e.t === 'gp'
          ? `gp:${e.p}>${e.c}`
          : JSON.stringify(e)

  const queueEdges = (edges: FsNode[]): void => {
    for (const e of edges) {
      const k = edgeKey(e)
      if (e.t === 'f' && e.crid) couples.set(e.crid, { a: e.a, b: e.b })
      if (edgeSeen.has(k)) continue
      edgeSeen.add(k)
      allEdges.push(e)
    }
  }

  // final=false: emit only edges whose EVERY named endpoint is already emitted
  // (a 'c' edge waits for both named parents, so no half-family churn mid-run).
  // final=true: today's end-of-import semantics — drop never-fetched parents,
  // keep the edge if the child plus at least one parent made it in.
  const flushEdges = (final: boolean): void => {
    for (let i = 0; i < allEdges.length; i++) {
      const e = allEdges[i]
      let out: FsNode | null = null
      if (e.t === 'f') {
        if (emitted.has(e.a) && emitted.has(e.b)) out = e
      } else if (e.t === 'c') {
        if (!emitted.has(e.c)) continue
        const fOk = !e.f || emitted.has(e.f)
        const mOk = !e.m || emitted.has(e.m)
        if (fOk && mOk) {
          out = e
        } else if (final) {
          const f = e.f && emitted.has(e.f) ? e.f : null
          const m = e.m && emitted.has(e.m) ? e.m : null
          if (f || m) out = { t: 'c', f, m, c: e.c }
        }
      } else if (e.t === 'gp') {
        if (emitted.has(e.c) && emitted.has(e.p)) out = e
      } else {
        out = e
      }
      if (out) {
        onNode(out)
        allEdges.splice(i, 1)
        i--
      }
    }
  }

  // Emitted person nodes by fid — the enrichment phase re-emits them with the
  // extras attached (the ingester fills non-destructively, so this is safe).
  const nodeByFid = new Map<string, FsNode & { t: 'i' }>()

  const popBest = (): Item | null => {
    if (!pq.length) return null
    let mi = 0
    for (let i = 1; i < pq.length; i++) if (pq[i].prio < pq[mi].prio) mi = i
    return pq.splice(mi, 1)[0]
  }

  const processItem = async (it: Item): Promise<void> => {
    const hops = Math.abs(it.gen)
    await selectTree(treeId)
    // The person record and their families are independent — fetch both at once.
    // Extras (portrait/photos/notes/sources) are DEFERRED to the enrichment
    // phase, so the tree core needs only these ~2 requests per person.
    // Already have this person from the bulk ancestry call? Then only the
    // family edges still need a request — half the traffic for the whole
    // direct line.
    const cached = preloaded.get(it.fid)
    const [pr, fam] = await Promise.all([
      cached
        ? Promise.resolve<{ status: number; doc: GxDocument | null }>({
            status: 200,
            doc: { persons: [cached] }
          })
        : gxGet(`/platform/tree/persons/${enc(it.fid)}`),
      fetchPersonFamilies(it.fid, treeId)
    ])
    const gp = pr.doc?.persons?.find((x) => x.id === it.fid) ?? pr.doc?.persons?.[0]
    const n = gp ? personToNode(gp) : null
    if (n && n.t === 'i') {
      onNode(n)
      emitted.add(it.fid)
      nodeByFid.set(it.fid, n as FsNode & { t: 'i' })
      processed++
      status(onStatus, 'processed', { name: `${n.g} ${n.s}`.trim() || it.fid, count: processed })
    }
    if (cancelled) return

    recordKnownRelatives(it.fid, fam.relatives.map((r) => r.fid))
    queueEdges(fam.edges)
    for (const rel of fam.relatives) {
      if (rel.kind === 'spouse') {
        // A spouse on the DIRECT line (the root, or a direct ancestor) is a
        // co-ancestor of the shared children — walk THEIR ancestors too. A
        // spouse of a descendant/collateral is just included as a leaf.
        if (it.role === 'root' || it.role === 'ancestor') {
          consider(rel.fid, it.gen, 'ancestor', it.prio + 0.5)
        } else {
          consider(rel.fid, it.gen, 'spouse', it.prio + 0.5, it.side)
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
          // line, before root's descendants). The chain is BOUNDED by the same
          // descend setting: 1 → siblings/aunts/uncles only, 2 → + their
          // children (cousins), … — previously it cascaded without limit.
          if (it.side < collateral) consider(rel.fid, it.gen - 1, 'collateral', 1000 + hops, it.side + 1)
        }
      }
    }

    // Wire up everything that just became complete. Synchronous (no await), so
    // concurrent workers can never interleave inside it.
    flushEdges(false)
  }

  // A few traversal workers drain the priority frontier concurrently; the
  // request scheduler above keeps the actual network load polite. An idle
  // worker waits while any other is busy — it may still refill the frontier.
  let busyWorkers = 0
  const worker = async (): Promise<void> => {
    for (;;) {
      if (cancelled) return
      const it = popBest()
      if (!it) {
        if (busyWorkers === 0) return
        await new Promise((r) => setTimeout(r, 40))
        continue
      }
      busyWorkers++
      try {
        await processItem(it)
      } catch {
        /* skip this person on an unexpected error — the tree must survive */
      } finally {
        busyWorkers--
      }
    }
  }
  // ---- Direct-line fast path ----------------------------------------------
  // With no descendants and no side branches requested, the pedigree is pulled
  // as WHOLE GENERATIONS via /tree/ancestry (ahnentafel-numbered, max 8
  // generations per request — measured: gen=8 answers, gen=11 is HTTP 400)
  // instead of crawling person by person. Parents are DERIVED from the
  // numbering (father of n is 2n, mother 2n+1), so the per-person /families
  // discovery round-trip disappears — roughly HALF the requests, and under
  // FamilySearch's processing-time budget that means roughly half the
  // wall-clock. Marriage facts still arrive: each person's own record carries
  // their couple relationships (verified live). Any surprise from the endpoint
  // falls back to the classic walker below.
  const directLine = descend === 0 && collateral === 0
  const runDirectLine = async (): Promise<boolean> => {
    // fid → smallest ahnentafel position (pedigree collapse keeps the nearest).
    const skeleton = new Map<string, number>()
    const note = (fid: string, abs: number): void => {
      const cur = skeleton.get(fid)
      if (cur === undefined || abs < cur) skeleton.set(fid, abs)
    }
    /** One /ancestry slice: ahnentafel number → fid ("1-S" spouse markers skipped). */
    const slice = async (fromFid: string, gens: number): Promise<Map<number, string>> => {
      const r = await gxGet(`/platform/tree/ancestry?person=${enc(fromFid)}&generations=${gens}`)
      const out = new Map<number, string>()
      for (const gp of r.doc?.persons ?? []) {
        const asc = gp.display?.ascendancyNumber ?? ''
        if (gp.id && /^\d+$/.test(asc)) out.set(Number(asc), gp.id)
      }
      return out
    }
    // Cover `ascend` generations in ≤8-generation hops: the top row of one
    // slice seeds the next, positions composed ahnentafel-style.
    const hops: { fid: string; base: number; left: number }[] = [{ fid: root, base: 1, left: ascend }]
    while (hops.length) {
      if (cancelled) return true
      const hop = hops.shift()!
      const gens = Math.min(hop.left, MAX_GEN)
      const got = await slice(hop.fid, gens)
      if (hop.base === 1 && got.size <= 1) return false // endpoint gave nothing → walker
      const tipRow = 2 ** gens
      for (const [m, fid] of got) {
        const k = Math.floor(Math.log2(m))
        const abs = hop.base * 2 ** k + (m - 2 ** k)
        note(fid, abs)
        if (hop.left > gens && m >= tipRow && m < tipRow * 2) {
          hops.push({ fid, base: abs, left: hop.left - gens })
        }
      }
    }
    // Closest generations first, so the person cap keeps the important people.
    const order = [...skeleton.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([fid]) => fid)
      .slice(0, maxPersons)
    const extras: string[] = []
    const fetchOne = async (fid: string, collectRootKin: boolean): Promise<void> => {
      const r = await gxGet(`/platform/tree/persons/${enc(fid)}`)
      const gp = r.doc?.persons?.find((x) => x.id === fid) ?? r.doc?.persons?.[0]
      const n = gp ? personToNode(gp) : null
      if (n && n.t === 'i') {
        onNode(n)
        emitted.add(fid)
        nodeByFid.set(fid, n as FsNode & { t: 'i' })
        processed++
        status(onStatus, 'processed', { name: `${n.g} ${n.s}`.trim() || fid, count: processed })
      }
      // Couple + parent-child edges ride along on the person document —
      // flushEdges only ever links persons that were actually fetched.
      if (r.doc) queueEdges(relationshipNodes(r.doc))
      // Record which relatives FamilySearch SHOWS for this person. A direct-line
      // import deliberately skips children and siblings — without this record
      // the change watcher flags every imported person with "new relatives on
      // FamilySearch" the moment the import finishes (that exact bug shipped
      // once). The walker path records the same thing from /families.
      const rels: string[] = []
      for (const rel of r.doc?.relationships ?? []) {
        if (rel.type && !/Couple$/i.test(rel.type)) continue
        for (const ref of [rel.person1, rel.person2]) {
          const id = ref?.resourceId ?? null
          if (id && id !== fid) rels.push(id)
        }
      }
      for (const cap of r.doc?.childAndParentsRelationships ?? []) {
        const c = cap.child?.resourceId ?? null
        const p1 = cap.parent1?.resourceId ?? null
        const p2 = cap.parent2?.resourceId ?? null
        if (c === fid) {
          if (p1) rels.push(p1)
          if (p2) rels.push(p2)
        } else if (c && (p1 === fid || p2 === fid)) {
          rels.push(c)
        }
      }
      if (collectRootKin) {
        // "The starting person's spouse(s) and children are always included."
        // The person document has proven reliable for couples but child rows
        // vary — ONE /families call on the root settles both the extras and
        // the root's own known-relatives record.
        const fam = await fetchPersonFamilies(fid, treeId)
        queueEdges(fam.edges)
        for (const rel of fam.relatives) {
          rels.push(rel.fid)
          if ((rel.kind === 'spouse' || rel.kind === 'child') && !skeleton.has(rel.fid)) {
            extras.push(rel.fid)
          }
        }
      }
      recordKnownRelatives(fid, rels)
      flushEdges(false)
    }
    // Root first (the UI re-roots on it the moment it lands), then the rest.
    await fetchOne(order[0] ?? root, true)
    const queue = [...order.slice(1), ...new Set(extras)]
    const fworker = async (): Promise<void> => {
      for (;;) {
        if (cancelled) return
        const fid = queue.shift()
        if (!fid) return
        if (emitted.has(fid)) continue
        try {
          await fetchOne(fid, false)
        } catch {
          /* one lost person must not sink the import */
        }
      }
    }
    await Promise.all(Array.from({ length: 6 }, () => fworker()))
    return true
  }

  if (!directLine || !(await runDirectLine())) {
    await Promise.all(Array.from({ length: 6 }, () => worker()))
  }
  status(onStatus, 'ancestors_done')

  saveRelSnapshot()

  // Endgame: emit the remaining edges — still ONLY between persons we actually
  // fetched, so a relationship never invents an empty placeholder.
  if (!cancelled) flushEdges(true)

  // Enrichment phase: portraits, photos, notes and sources for every imported
  // person — AFTER the tree is complete and usable. Runs through the same
  // scheduler, in the same priority order (root and direct line first), and a
  // Stop keeps everything imported so far.
  if (!cancelled) {
    const order = [...emitted]
    let enriched = 0
    const eworker = async (): Promise<void> => {
      for (;;) {
        if (cancelled) return
        const fid = order.shift()
        if (!fid) return
        try {
          const extras = await fetchPersonExtras(fid)
          const n = nodeByFid.get(fid)
          if (n && (extras.media.length || extras.notes.length || extras.di.length)) {
            if (extras.media.length) n.media = extras.media
            if (extras.notes.length) n.no = extras.notes
            if (extras.di.length) n.di = extras.di
            onNode(n)
          }
          for (const sn of extras.sources) {
            if (cancelled) break
            onNode(sn)
          }
        } catch {
          /* extras are best-effort — never fail the import over them */
        }
        enriched++
        const nn = nodeByFid.get(fid)
        status(onStatus, 'enriching', {
          name: nn ? `${nn.g} ${nn.s}`.trim() || fid : fid,
          count: enriched,
          total: order.length + enriched
        })
      }
    }
    // Twice the workers the fixed scheduler used to allow: the pacing loop is
    // the real governor now, so extra workers only fill slots it has already
    // decided are safe — they can no longer outrun the server on their own.
    await Promise.all(Array.from({ length: 8 }, () => eworker()))

    // Notes written about the COUPLE (not about either spouse). They sit on
    // their own sub-resource, so nothing ever fetched them and they went
    // missing on every import — even though the ingester has always had a
    // column waiting for them.
    const crids = [...couples].filter(([, p]) => emitted.has(p.a) && emitted.has(p.b)).map(([id]) => id)
    const cworker = async (): Promise<void> => {
      for (;;) {
        if (cancelled) return
        const crid = crids.shift()
        if (!crid) return
        const pair = couples.get(crid)!
        try {
          const r = await gxGet(`/platform/tree/couple-relationships/${enc(crid)}/notes`)
          const rel = (
            r.doc as unknown as { relationships?: { notes?: { subject?: string; text?: string }[] }[] } | null
          )?.relationships?.[0]
          const text = (rel?.notes ?? [])
            .map((n) => [n.subject, n.text].filter(Boolean).join(': ').trim())
            .filter(Boolean)
            .join('\n\n')
          if (text) onNode({ t: 'f', a: pair.a, b: pair.b, mn: text })
        } catch {
          /* best-effort, exactly like the person extras */
        }
      }
    }
    await Promise.all(Array.from({ length: 3 }, () => cworker()))
  }

  // Always anchor the tree on the starting person (the signed-in user's FS
  // person, or the explicitly chosen root) — set as the global root person.
  if (!opts.keepRoot) {
    const rootPerson = People.findByFsId(root)
    if (rootPerson) AppSettings.set('default_root_person_id', rootPerson.id)
  }
  return { rootFid: root }
}

/**
 * Throttling self-test against FamilySearch's dedicated `/platform/throttled`
 * endpoint, which answers 429 on purpose. It proves — against the real server,
 * not a mock — that the client reads Retry-After, waits, retries and recovers,
 * and it reports where the pacing loop settled. Worth running before blaming an
 * import on the network.
 */
export async function probeFamilySearchThrottle(): Promise<{
  ok: boolean
  status: number
  attempts: number
  waitedMs: number
  retryAfterMs: number | null
  pace: ReturnType<typeof familySearchPaceStats>
}> {
  const started = Date.now()
  let retryAfter: number | null = null
  let attempts = 0
  let status = 0
  for (; attempts < 4; attempts++) {
    let res: Response
    try {
      res = await schedFetch(API + '/platform/throttled', {
        headers: {
          ...(cachedToken ? { Authorization: `Bearer ${cachedToken}` } : {}),
          Accept: 'application/json',
          'User-Agent': USER_AGENT,
          'Accept-Language': 'en'
        }
      })
    } catch {
      break
    }
    status = res.status
    if (res.status !== 429) {
      attempts++
      break
    }
    const ra = Number(res.headers.get('Retry-After'))
    retryAfter = Number.isFinite(ra) && ra > 0 ? ra * 1000 : null
    const wait = retryAfterMs(res, attempts)
    backOff(wait)
    await new Promise((r) => setTimeout(r, wait))
  }
  return {
    ok: status > 0 && status !== 429,
    status,
    attempts,
    waitedMs: Date.now() - started,
    retryAfterMs: retryAfter,
    pace: familySearchPaceStats()
  }
}

export async function previewFamilySearch(opts: {
  root?: string
  ascend?: number
  onStatus?: (s: FamilySearchStatus) => void
}): Promise<FamilySearchPreview> {
  status(opts.onStatus, 'auth')
  const root = await resolveRoot(opts.root)
  if (!root) {
    throw rootFailure()
  }
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
    if (extras.di.length) main.di = extras.di
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
  return personFieldDiff(p, n)
}

/** Two place strings that resolve to the same coordinates in the gazetteer are
 *  the SAME place — e.g. "Budapest, Hungary" vs the standardized "Budapest,
 *  Magyarország". The standardization pass stores BOTH variants with identical
 *  coordinates precisely so this check works offline; without it, every place
 *  standardization instantly re-flagged all imported people as "changed". */
function samePlace(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  if (a.trim() === b.trim()) return true
  if (canonicalizeCountryInPlace(a) === canonicalizeCountryInPlace(b)) return true
  const pa = Places.get(a)
  if (!pa) return false
  const pb = Places.get(b)
  if (!pb) return false
  return Math.abs(pa.lat - pb.lat) < 0.0015 && Math.abs(pa.lon - pb.lon) < 0.0015
}

const PLACE_FIELDS = new Set(['birthPlace', 'deathPlace', 'christeningPlace', 'burialPlace'])

/** Field-level pull/push diff between a local person and their FS node. */
function personFieldDiff(
  p: Person,
  n: Extract<FsNode, { t: 'i' }>
): { pull: FsFieldDiff[]; push: FsFieldDiff[] } {
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
    // A place written differently but resolving to the same coordinates is NOT
    // a difference — neither to pull nor to push.
    if (PLACE_FIELDS.has(field) && samePlace(local, remote)) continue
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
  if (!cachedToken) return { error: 'NOT_SIGNED_IN' }
  const p = People.get(personId)
  if (!p) return { error: 'NOT_FOUND' }
  if (!p.fsId) return { error: 'NOT_LINKED' }

  // ONE parallel burst per person: record + families + extras together (the
  // change scan calls this for every linked person — serially this was 3×
  // slower, and the record used to be fetched twice).
  const [doc, fam, extras] = await Promise.all([
    getPersonDoc(p.fsId),
    fetchPersonFamilies(p.fsId),
    fetchPersonExtras(p.fsId)
  ])
  const gp = doc?.persons?.find((x) => x.id === p.fsId) ?? doc?.persons?.[0]
  if (!gp) return { error: 'FS_NOT_FOUND' }
  const node = personToNode(gp)
  if (!node || node.t !== 'i') return { error: 'FS_NOT_FOUND' }
  const diff = personFieldDiff(p, node)

  const local = localRelativeFsIds(personId)
  // A relative counts as NEW only if it is neither local nor already known from
  // the import snapshot (out-of-scope relatives were known, so not "changes").
  const known = new Set(loadRelSnapshot()[p.fsId] ?? [])
  const newRelatives = fam.relatives.filter((r) => !local.has(r.fid) && !known.has(r.fid))

  const db = getDb()
  const cnt = (sql: string): number =>
    ((db.prepare(sql).get(personId) as { n: number } | undefined)?.n ?? 0)
  const remoteOcc = gp.facts?.filter((f) => f.type === GX + 'Occupation').length ?? 0

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

  // Events: count a remote event as MISSING only if importing it would actually
  // create something — the same routing the importer applies. A Baptism /
  // Christening fact that already lives in the christening FIELD (that is where
  // the import puts it) is NOT a change; anything else is matched by the same
  // fs_key the idempotent import insert uses. Without this, a freshly imported
  // person with a Baptism fact showed a phantom "events 0 → 1" forever.
  const evList =
    (node as { ev?: { type: string; date: string | null; place: string | null; value: string | null }[] }).ev ?? []
  const hasEvKey = db.prepare(
    "SELECT 1 FROM events WHERE owner_type='person' AND owner_id = ? AND fs_key = ? LIMIT 1"
  )
  const evMissing = evList.filter((e) => {
    const type = (e.type ?? 'other').trim() || 'other'
    if (/bapti|christen/i.test(type) && (e.date || e.place)) {
      if ((e.date && p.christeningDate === e.date) || (!e.date && e.place && p.christeningPlace === e.place)) return false
      if (!p.christeningDate && !p.christeningPlace) return true
    }
    const key = `${type}|${e.date ?? ''}|${e.place ?? ''}|${e.value ?? ''}`
    return !hasEvKey.get(personId, key)
  }).length
  const remoteEv = evList.length

  const content: FsContentCounts = {
    // local = remote - missing, so the scan flags ONLY when something is missing.
    notes: { local: extras.notes.length - notesMissing, remote: extras.notes.length },
    media: { local: extras.media.length - mediaMissing, remote: extras.media.length },
    sources: { local: Math.min(localSrc, extras.sources.length), remote: extras.sources.length },
    occupations: { local: Math.min(localOcc, remoteOcc), remote: remoteOcc },
    events: { local: remoteEv - evMissing, remote: remoteEv }
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
  const pulled = new Set<string>()
  for (const r of fresh) {
    const doc = await getPersonDoc(r.fid)
    const gp = doc?.persons?.find((x) => x.id === r.fid) ?? doc?.persons?.[0]
    const n = gp ? personToNode(gp) : null
    if (!n || n.t !== 'i') continue
    const extras = await fetchPersonExtras(r.fid)
    if (extras.media.length) n.media = extras.media
    if (extras.notes.length) n.no = extras.notes
    if (extras.di.length) n.di = extras.di
    pulled.add(r.fid)
    nodes.push(n, ...extras.sources)
  }
  // Edges ONLY between persons that exist — freshly pulled above, or already in
  // the database. An edge to an out-of-scope person (e.g. the spouse's parents
  // beyond the imported depth) used to make the ingester create an EMPTY stub:
  // the person count grew on every manual sync and the data-issue checker
  // flagged nameless, unconnected people.
  const resolvable = (f: string | null | undefined): boolean =>
    !!f && (pulled.has(f) || !!People.findByFsId(f))
  for (const e of fam.edges) {
    if (e.t === 'f') {
      if (resolvable(e.a) && resolvable(e.b)) nodes.push(e)
    } else if (e.t === 'c') {
      if (!resolvable(e.c)) continue
      const f = e.f && resolvable(e.f) ? e.f : null
      const m = e.m && resolvable(e.m) ? e.m : null
      if (f || m) nodes.push({ t: 'c', f, m, c: e.c })
    } else if (e.t === 'gp') {
      if (resolvable(e.c) && resolvable(e.p)) nodes.push(e)
    } else {
      nodes.push(e)
    }
  }
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
  try {
    const res = await schedFetch(
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
  try {
    const res = await schedFetch(`${API}/platform/dates?date=${enc(raw)}`, {
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
