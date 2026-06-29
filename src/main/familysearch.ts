/**
 * Official FamilySearch integration.
 *
 * Auth: OAuth 2.0 Authorization Code + PKCE — the user signs in on FamilySearch's
 * OWN page (in an embedded window); TreeMonk never sees the password and never
 * handles a client secret. Configure with env:
 *   - FS_CLIENT_ID    your registered application key  (REQUIRED to enable)
 *   - FS_ENV          'beta' (default) | 'production'
 *   - FS_REDIRECT_URI a redirect URI registered with your key
 *
 * Data: the documented /platform/tree/* endpoints (GEDCOM-X), mapped into the
 * existing FsNode stream so the proven FsIngester DB writer is reused.
 *
 * Until FS_CLIENT_ID is set the import is disabled (loginFamilySearchOAuth
 * resolves { ok:false, error:'NO_CLIENT_ID' }) — the import stays disabled until then.
 */
import { app, BrowserWindow, session } from 'electron'
import { createHash, randomBytes } from 'crypto'
import { wipeDatabase } from './db/admin'
import { AppSettings, People } from './db/repo'
import type { FsNode } from './db/fsIngest'
import { documentToNodes, type GxDocument, type GxPerson } from './fs/gedcomx'
import type {
  FamilySearchImportOptions,
  FamilySearchPersonResult,
  FamilySearchPreview,
  FamilySearchStatus
} from '@shared/types'

// ---- Config ----------------------------------------------------------------
const FS_CLIENT_ID = process.env.FS_CLIENT_ID ?? ''
const FS_ENV = (process.env.FS_ENV ?? 'beta').toLowerCase()
const BETA = FS_ENV !== 'production'
const IDENT = BETA ? 'https://identbeta.familysearch.org' : 'https://ident.familysearch.org'
const API = BETA ? 'https://apibeta.familysearch.org' : 'https://api.familysearch.org'
const AUTH_URL = `${IDENT}/cis-web/oauth2/v3/authorization`
const TOKEN_URL = `${IDENT}/cis-web/oauth2/v3/token`
const REDIRECT_URI = process.env.FS_REDIRECT_URI ?? 'http://127.0.0.1:8765/callback'
const SCOPE = 'openid profile email'
const ACCEPT_GX = 'application/x-gedcomx-v1+json'
const MAX_GEN = 8 // FamilySearch caps ancestry at 8 generations per request

// ---- Token (in-memory only; short-lived) -----------------------------------
let cachedToken: string | null = null
export function getCachedToken(): string | null {
  return cachedToken
}
/** No passwords are handled any more — kept only to satisfy the IPC contract. */
export function getCachedCreds(): { username: string; password: string } | null {
  return null
}
export function rememberCreds(): void {
  /* no-op: the official flow has no password to remember */
}
export function forgetCreds(): void {
  cachedToken = null
  try {
    void session.fromPartition('persist:fs-oauth').clearStorageData()
  } catch {
    /* ignore */
  }
}

// ---- PKCE browser sign-in --------------------------------------------------
const b64url = (b: Buffer): string =>
  b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** Opens FamilySearch's own sign-in page, runs the Authorization Code + PKCE
 *  flow, and caches the access token. */
export function loginFamilySearchOAuth(): Promise<{ ok: boolean; error?: string }> {
  if (!FS_CLIENT_ID) return Promise.resolve({ ok: false, error: 'NO_CLIENT_ID' })
  return new Promise((resolve) => {
    const verifier = b64url(randomBytes(48))
    const challenge = b64url(createHash('sha256').update(verifier).digest())
    const authUrl =
      AUTH_URL +
      '?response_type=code' +
      '&client_id=' + encodeURIComponent(FS_CLIENT_ID) +
      '&redirect_uri=' + encodeURIComponent(REDIRECT_URI) +
      '&scope=' + encodeURIComponent(SCOPE) +
      '&code_challenge=' + encodeURIComponent(challenge) +
      '&code_challenge_method=S256'

    const win = new BrowserWindow({
      width: 480,
      height: 680,
      title: 'FamilySearch',
      autoHideMenuBar: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true, partition: 'persist:fs-oauth' }
    })
    let settled = false
    let exchanging = false
    const finish = (r: { ok: boolean; error?: string }): void => {
      if (settled) return
      settled = true
      try {
        if (!win.isDestroyed()) win.destroy()
      } catch {
        /* ignore */
      }
      resolve(r)
    }
    const onNav = (e: Electron.Event, url: string): void => {
      if (settled || exchanging || !url.startsWith(REDIRECT_URI)) return
      let code: string | null = null
      try {
        code = new URL(url).searchParams.get('code')
      } catch {
        /* ignore */
      }
      if (!code) return
      e.preventDefault()
      exchanging = true
      void exchangeCode(code, verifier).then((tok) =>
        tok ? (cachedToken = tok, finish({ ok: true })) : finish({ ok: false, error: 'TOKEN_EXCHANGE_FAILED' })
      )
    }
    win.webContents.on('will-redirect', (e, url) => onNav(e, url))
    win.webContents.on('will-navigate', (e, url) => onNav(e, url))
    win.on('closed', () => {
      if (!settled) {
        settled = true
        resolve({ ok: false, error: 'CANCELLED' })
      }
    })
    void win.loadURL(authUrl)
  })
}

async function exchangeCode(code: string, verifier: string): Promise<string | null> {
  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: FS_CLIENT_ID,
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier
    })
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body
    })
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.error('[fs] token exchange', res.status, (await res.text()).slice(0, 300))
      return null
    }
    const data = (await res.json()) as { access_token?: string }
    return data.access_token ?? null
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[fs] token exchange threw', e)
    return null
  }
}

// ---- API fetch (bearer + GEDCOM-X + throttle/retry) ------------------------
let lastCall = 0
async function gxGet(path: string): Promise<{ status: number; doc: GxDocument | null; location?: string }> {
  if (!cachedToken) return { status: 401, doc: null }
  // Be polite: ≥250ms between calls (FamilySearch throttles aggressively).
  const wait = lastCall + 250 - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  for (let attempt = 0; attempt < 4; attempt++) {
    lastCall = Date.now()
    const res = await fetch(API + path, {
      redirect: 'manual',
      headers: { Authorization: `Bearer ${cachedToken}`, Accept: ACCEPT_GX }
    })
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
      continue
    }
    if (res.status === 204) return { status: 204, doc: null }
    if (res.status >= 300 && res.status < 400) {
      return { status: res.status, doc: null, location: res.headers.get('Location') ?? undefined }
    }
    if (!res.ok) return { status: res.status, doc: null }
    const doc = (await res.json().catch(() => null)) as GxDocument | null
    return { status: res.status, doc }
  }
  return { status: 429, doc: null }
}

/** Resolve the starting person fid: explicit root, else the current user. */
async function resolveRoot(root?: string): Promise<string | null> {
  if (root) return root
  const r = await gxGet('/platform/tree/current-person')
  if (r.location) return r.location.replace(/^.*\/persons\//, '').replace(/[/?].*$/, '')
  return null
}

const status = (onStatus: ((s: FamilySearchStatus) => void) | undefined, phase: FamilySearchStatus['phase'], extra: Partial<FamilySearchStatus> = {}): void =>
  onStatus?.({ phase, ...extra })

// ---- Import (ancestry, official API) ---------------------------------------
let cancelled = false
export function cancelFamilySearchImport(): void {
  cancelled = true
}

export async function importFromFamilySearch(
  opts: FamilySearchImportOptions,
  onStatus: (s: FamilySearchStatus) => void,
  onNode: (node: FsNode) => void
): Promise<void> {
  cancelled = false
  if (opts.replace === true) wipeDatabase()
  status(onStatus, 'auth')
  const root = await resolveRoot(opts.root)
  if (!root) throw new Error('Could not determine the starting person.')

  status(onStatus, 'fetching_root')
  const generations = Math.min(MAX_GEN, Math.max(1, opts.ascend ?? 4))
  const emit = (nodes: FsNode[]): void => {
    for (const n of nodes) {
      if (cancelled) return
      onNode(n)
    }
  }

  // Ancestors: one efficient call for the whole upward pedigree.
  status(onStatus, 'ancestors')
  const anc = await gxGet(
    `/platform/tree/ancestry?person=${encodeURIComponent(root)}&generations=${generations}&personDetails=true&marriageDetails=true`
  )
  if (anc.doc) emit(documentToNodes(anc.doc))
  status(onStatus, 'ancestors_done')

  // Optional descendants of the starting person (side-branches).
  const childrenDepth = Math.min(MAX_GEN, opts.childrenDepth ?? 0)
  if (childrenDepth > 0 && !cancelled) {
    status(onStatus, 'side_branches')
    const desc = await gxGet(
      `/platform/tree/descendancy?person=${encodeURIComponent(root)}&generations=${childrenDepth}&marriageDetails=true`
    )
    if (desc.doc) emit(documentToNodes(desc.doc))
  }

  if (opts.root && !opts.keepRoot) {
    const rootPerson = People.findByFsId(opts.root)
    if (rootPerson) AppSettings.set('default_root_person_id', rootPerson.id)
  }
}

/** Quick preview: confirm the starting person + count the ancestors. */
export async function previewFamilySearch(opts: {
  username: string
  password: string
  root: string
  ascend?: number
  onStatus?: (s: FamilySearchStatus) => void
}): Promise<FamilySearchPreview> {
  status(opts.onStatus, 'auth')
  const root = await resolveRoot(opts.root)
  if (!root) throw new Error('Could not determine the starting person.')
  status(opts.onStatus, 'fetching_root')
  const generations = Math.min(MAX_GEN, Math.max(1, opts.ascend ?? 4))
  const r = await gxGet(
    `/platform/tree/ancestry?person=${encodeURIComponent(root)}&generations=${generations}`
  )
  const persons = r.doc?.persons ?? []
  const rootP = persons.find((p) => p.id === root) ?? persons[0]
  return {
    root: rootP ? personToResult(rootP) : { id: root, name: root, lifespan: null, gender: null },
    ancestors: Math.max(0, persons.length - 1)
  }
}

/** Sync ONE person from FamilySearch → its FsNode stream (vitals + relations). */
export async function syncPersonFromFamilySearch(opts: {
  username: string
  password: string
  fid: string
}): Promise<FsNode[]> {
  const r = await gxGet(`/platform/tree/persons/${encodeURIComponent(opts.fid)}`)
  return r.doc ? documentToNodes(r.doc) : []
}

/** Search FamilySearch for people matching a name (for the starting person). */
export async function searchFamilySearch(opts: {
  username: string
  password: string
  query: string
}): Promise<FamilySearchPersonResult[]> {
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
