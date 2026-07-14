import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'
import { AppSettings, Documents, Events, Families, People, Places } from '../db/repo'
import { resolveMediaPath } from '../db/connection'
import { buildPedigree } from '../db/pedigree'
import { buildAtlasPoints } from '../db/atlasData'
import { exportGedcom } from '../gedcom/export'
import type { ApiServerConfig, ApiServerStatus, EventRecord, FamilyInput, PersonInput } from '@shared/types'
import { handleMcpRequest } from './mcp'
import { DOCS_HTML } from './docs'

/**
 * TreeMonk Local API — an opt-in HTTP server bound STRICTLY to 127.0.0.1.
 *
 * Security model: OFF by default; every data route requires the Bearer token
 * generated in Settings; writes sit behind a second explicit toggle; the
 * socket never binds to a routable interface, so nothing is reachable from
 * the network. External writes go through the exact same repository layer as
 * the UI (audit history included) and broadcast a change event so open
 * windows refresh live.
 *
 * Env overrides (scripts / e2e): TREEMONK_API=1, TREEMONK_API_PORT,
 * TREEMONK_API_TOKEN, TREEMONK_API_WRITES=1, TREEMONK_API_MCP=1.
 */

export type ApiConfig = ApiServerConfig
export type ApiStatus = ApiServerStatus

const DEFAULT_PORT = 27007

let server: Server | null = null
let status: ApiStatus = { running: false, port: DEFAULT_PORT, error: null }
let broadcast: () => void = () => undefined

/** The main process registers how to tell open windows about external writes. */
export function setApiChangeBroadcaster(fn: () => void): void {
  broadcast = fn
}

function envBool(name: string): boolean | null {
  const v = process.env[name]
  if (v === undefined) return null
  return v === '1' || v.toLowerCase() === 'true'
}

export function getApiConfig(): ApiConfig {
  let token = AppSettings.get('api.token')
  if (!token) {
    token = randomBytes(24).toString('base64url')
    AppSettings.set('api.token', token)
  }
  const cfg: ApiConfig = {
    enabled: AppSettings.get('api.enabled') === '1',
    port: Number(AppSettings.get('api.port')) || DEFAULT_PORT,
    token,
    allowWrites: AppSettings.get('api.writes') === '1',
    mcpEnabled: AppSettings.get('api.mcp') === '1'
  }
  // Env overrides — used by scripts and the e2e suite.
  const e = envBool('TREEMONK_API')
  if (e !== null) cfg.enabled = e
  if (process.env.TREEMONK_API_PORT) cfg.port = Number(process.env.TREEMONK_API_PORT) || cfg.port
  if (process.env.TREEMONK_API_TOKEN) cfg.token = process.env.TREEMONK_API_TOKEN
  const w = envBool('TREEMONK_API_WRITES')
  if (w !== null) cfg.allowWrites = w
  const m = envBool('TREEMONK_API_MCP')
  if (m !== null) cfg.mcpEnabled = m
  return cfg
}

export function setApiConfig(patch: Partial<Omit<ApiConfig, 'token'>>): ApiConfig {
  if (patch.enabled !== undefined) AppSettings.set('api.enabled', patch.enabled ? '1' : '0')
  if (patch.port !== undefined) AppSettings.set('api.port', String(patch.port))
  if (patch.allowWrites !== undefined) AppSettings.set('api.writes', patch.allowWrites ? '1' : '0')
  if (patch.mcpEnabled !== undefined) AppSettings.set('api.mcp', patch.mcpEnabled ? '1' : '0')
  restartApiServer()
  return getApiConfig()
}

export function regenerateApiToken(): string {
  const token = randomBytes(24).toString('base64url')
  AppSettings.set('api.token', token)
  return token
}

export function getApiStatus(): ApiStatus {
  return status
}

// ---------------------------------------------------------------------------

class ApiError extends Error {
  constructor(
    public code: number,
    message: string
  ) {
    super(message)
  }
}

function json(res: ServerResponse, code: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(text)
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > 1024 * 1024) throw new ApiError(413, 'Body too large (1 MB limit)')
    chunks.push(chunk as Buffer)
  }
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf-8'))
  } catch {
    throw new ApiError(400, 'Invalid JSON body')
  }
}

/** Person detail: the person plus their relations, events and occupations. */
function personDetail(id: string): unknown {
  const person = People.get(id)
  if (!person) throw new ApiError(404, 'Person not found')
  const families = Families.list()
  const asChild = families.find((f) => f.childIds.includes(id)) ?? null
  const unions = families.filter((f) => f.husbandId === id || f.wifeId === id)
  const events = Events.forOwner('person', id)
  return { person, parentsFamily: asChild, unions, events }
}

const PERSON_FIELDS: (keyof PersonInput)[] = [
  'givenName',
  'surname',
  'sex',
  'birthDate',
  'birthPlace',
  'deathDate',
  'deathPlace',
  'deceased',
  'illegitimate',
  'christeningDate',
  'christeningPlace',
  'burialDate',
  'burialPlace',
  'religion',
  'notes'
]
const FAMILY_FIELDS: (keyof FamilyInput)[] = [
  'husbandId',
  'wifeId',
  'marriageDate',
  'marriagePlace',
  'marriageOrder',
  'notes',
  'childIds'
]

function pick<T extends object>(body: unknown, fields: (keyof T)[]): Partial<T> {
  const src = (body ?? {}) as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const f of fields) if (f in src) out[f as string] = src[f as string]
  return out as Partial<T>
}

interface Route {
  method: string
  pattern: RegExp
  write?: boolean
  handler: (req: IncomingMessage, params: string[], query: URLSearchParams) => Promise<unknown> | unknown
}

const routes: Route[] = [
  {
    method: 'GET',
    pattern: /^\/api\/v1\/stats$/,
    handler: () => {
      const people = People.list()
      const families = Families.list()
      const places = Places.list()
      let earliest: number | null = null
      let latest: number | null = null
      for (const p of people) {
        const y = Number((p.birthDate ?? '').match(/\d{4}/)?.[0])
        if (y) {
          if (earliest === null || y < earliest) earliest = y
          if (latest === null || y > latest) latest = y
        }
      }
      return {
        people: people.length,
        families: families.length,
        geocodedPlaces: places.length,
        earliestBirthYear: earliest,
        latestBirthYear: latest
      }
    }
  },
  {
    method: 'GET',
    pattern: /^\/api\/v1\/people$/,
    handler: (_req, _p, query) => {
      const q = (query.get('q') ?? '').trim().toLowerCase()
      const limit = Math.min(Number(query.get('limit')) || 100, 500)
      const offset = Number(query.get('offset')) || 0
      let list = People.list()
      if (q)
        list = list.filter((p) =>
          `${p.givenName} ${p.surname} ${p.surname} ${p.givenName}`.toLowerCase().includes(q)
        )
      return { total: list.length, offset, items: list.slice(offset, offset + limit) }
    }
  },
  { method: 'GET', pattern: /^\/api\/v1\/people\/([^/]+)$/, handler: (_r, [id]) => personDetail(id) },
  {
    method: 'POST',
    pattern: /^\/api\/v1\/people$/,
    write: true,
    handler: async (req) => People.create(pick<PersonInput>(await readBody(req), PERSON_FIELDS))
  },
  {
    method: 'PATCH',
    pattern: /^\/api\/v1\/people\/([^/]+)$/,
    write: true,
    handler: async (req, [id]) => {
      if (!People.get(id)) throw new ApiError(404, 'Person not found')
      return People.update(id, pick<PersonInput>(await readBody(req), PERSON_FIELDS))
    }
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/v1\/people\/([^/]+)$/,
    write: true,
    handler: (_r, [id]) => {
      if (!People.get(id)) throw new ApiError(404, 'Person not found')
      People.remove(id)
      return { deleted: id }
    }
  },
  {
    method: 'GET',
    pattern: /^\/api\/v1\/families$/,
    handler: (_r, _p, query) => {
      const limit = Math.min(Number(query.get('limit')) || 200, 1000)
      const offset = Number(query.get('offset')) || 0
      const list = Families.list()
      return { total: list.length, offset, items: list.slice(offset, offset + limit) }
    }
  },
  {
    method: 'GET',
    pattern: /^\/api\/v1\/families\/([^/]+)$/,
    handler: (_r, [id]) => {
      const f = Families.get(id)
      if (!f) throw new ApiError(404, 'Family not found')
      return f
    }
  },
  {
    method: 'POST',
    pattern: /^\/api\/v1\/families$/,
    write: true,
    handler: async (req) => Families.create(pick<FamilyInput>(await readBody(req), FAMILY_FIELDS))
  },
  {
    method: 'PATCH',
    pattern: /^\/api\/v1\/families\/([^/]+)$/,
    write: true,
    handler: async (req, [id]) => {
      if (!Families.get(id)) throw new ApiError(404, 'Family not found')
      return Families.update(id, pick<FamilyInput>(await readBody(req), FAMILY_FIELDS))
    }
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/v1\/families\/([^/]+)$/,
    write: true,
    handler: (_r, [id]) => {
      if (!Families.get(id)) throw new ApiError(404, 'Family not found')
      Families.remove(id)
      return { deleted: id }
    }
  },
  {
    method: 'GET',
    pattern: /^\/api\/v1\/people\/([^/]+)\/events$/,
    handler: (_r, [id]) => Events.forOwner('person', id)
  },
  {
    method: 'POST',
    pattern: /^\/api\/v1\/people\/([^/]+)\/events$/,
    write: true,
    handler: async (req, [id]) => {
      if (!People.get(id)) throw new ApiError(404, 'Person not found')
      const b = (await readBody(req)) as Partial<EventRecord>
      return Events.create('person', id, {
        type: String(b.type ?? 'other'),
        date: b.date ?? null,
        endDate: b.endDate ?? null,
        place: b.place ?? null,
        value: b.value ?? null,
        note: b.note ?? null
      })
    }
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/v1\/events\/([^/]+)$/,
    write: true,
    handler: (_r, [id]) => {
      Events.remove(id)
      return { deleted: id }
    }
  },
  {
    method: 'GET',
    pattern: /^\/api\/v1\/people\/([^/]+)\/documents$/,
    handler: (_r, [id]) => {
      if (!People.get(id)) throw new ApiError(404, 'Person not found')
      return Documents.listForPerson(id)
    }
  },
  {
    method: 'GET',
    pattern: /^\/api\/v1\/documents\/([^/]+)\/file$/,
    handler: (_r, [id]) => {
      const doc = Documents.get(id)
      if (!doc) throw new ApiError(404, 'Document not found')
      if (/^https?:\/\//i.test(doc.filePath))
        throw new ApiError(409, 'File not downloaded locally yet — open it in the app first')
      const filePath = resolveMediaPath(doc.filePath)
      if (!existsSync(filePath)) throw new ApiError(410, 'File missing on disk')
      const mime =
        doc.mimeType ||
        { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.pdf': 'application/pdf' }[
          extname(filePath).toLowerCase()
        ] ||
        'application/octet-stream'
      return { __raw: { mime, body: readFileSync(filePath) } }
    }
  },
  { method: 'GET', pattern: /^\/api\/v1\/places$/, handler: () => Places.list() },
  {
    method: 'GET',
    pattern: /^\/api\/v1\/pedigree$/,
    handler: (_r, _p, query) => buildPedigree(query.get('rootId') ?? undefined) ?? {}
  },
  { method: 'GET', pattern: /^\/api\/v1\/atlas\/points$/, handler: () => buildAtlasPoints() },
  {
    method: 'GET',
    pattern: /^\/api\/v1\/export\/gedcom$/,
    handler: () => {
      const file = join(tmpdir(), `treemonk-api-${Date.now()}.ged`)
      return { gedcom: exportGedcom(file) }
    }
  }
]

async function handle(req: IncomingMessage, res: ServerResponse, cfg: ApiConfig): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  const path = url.pathname

  // Unauthenticated, data-free routes.
  if (path === '/api/v1/ping') return json(res, 200, { name: 'TreeMonk', version: app.getVersion() })
  if (path === '/docs' || path === '/docs/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(DOCS_HTML)
    return
  }
  if (path === '/api/v1/openapi.json') return json(res, 200, buildOpenApi(cfg))

  // Everything else requires the Bearer token.
  const auth = req.headers.authorization ?? ''
  if (auth !== `Bearer ${cfg.token}`) return json(res, 401, { error: 'Missing or invalid Bearer token' })

  if (path === '/mcp') {
    if (!cfg.mcpEnabled) return json(res, 404, { error: 'MCP endpoint is disabled' })
    return handleMcpRequest(req, res, cfg.allowWrites, () => broadcast())
  }

  for (const r of routes) {
    if (req.method !== r.method) continue
    const m = path.match(r.pattern)
    if (!m) continue
    if (r.write && !cfg.allowWrites) return json(res, 403, { error: 'Writes are disabled in Settings' })
    try {
      const result = await r.handler(req, m.slice(1).map(decodeURIComponent), url.searchParams)
      if (result && typeof result === 'object' && '__raw' in (result as Record<string, unknown>)) {
        const raw = (result as { __raw: { mime: string; body: Buffer } }).__raw
        res.writeHead(200, { 'Content-Type': raw.mime, 'Content-Length': raw.body.length })
        res.end(raw.body)
      } else {
        json(res, req.method === 'POST' ? 201 : 200, result)
      }
      if (r.write) broadcast()
    } catch (e) {
      if (e instanceof ApiError) return json(res, e.code, { error: e.message })
      json(res, 500, { error: e instanceof Error ? e.message : 'Internal error' })
    }
    return
  }
  json(res, 404, { error: 'Unknown endpoint — see /docs' })
}

export function startApiIfEnabled(): void {
  const cfg = getApiConfig()
  if (!cfg.enabled) return
  stopApiServer()
  try {
    server = createServer((req, res) => {
      void handle(req, res, getApiConfig()).catch(() => {
        if (!res.headersSent) json(res, 500, { error: 'Internal error' })
      })
    })
    server.on('error', (e) => {
      status = { running: false, port: cfg.port, error: (e as NodeJS.ErrnoException).code ?? e.message }
      server = null
    })
    // 127.0.0.1 ONLY — never reachable from the network.
    server.listen(cfg.port, '127.0.0.1', () => {
      status = { running: true, port: cfg.port, error: null }
    })
  } catch (e) {
    status = { running: false, port: cfg.port, error: e instanceof Error ? e.message : String(e) }
  }
}

export function stopApiServer(): void {
  if (server) {
    server.close()
    server = null
  }
  status = { running: false, port: getApiConfig().port, error: null }
}

export function restartApiServer(): void {
  stopApiServer()
  startApiIfEnabled()
}

// ---------------------------------------------------------------------------

/** Hand-maintained OpenAPI 3.1 description of the surface above. */
function buildOpenApi(cfg: ApiConfig): unknown {
  const p = (
    summary: string,
    opts: { write?: boolean; params?: unknown[]; body?: boolean } = {}
  ): unknown => ({
    summary: opts.write ? `${summary} (requires writes toggle)` : summary,
    security: [{ bearer: [] }],
    ...(opts.params ? { parameters: opts.params } : {}),
    ...(opts.body ? { requestBody: { content: { 'application/json': { schema: { type: 'object' } } } } } : {}),
    responses: { '200': { description: 'OK' } }
  })
  const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
  return {
    openapi: '3.1.0',
    info: {
      title: 'TreeMonk Local API',
      version: app.getVersion(),
      description:
        'Local-first genealogy data over HTTP. Bound to 127.0.0.1; every data route requires the Bearer token from Settings. The MCP endpoint lives at /mcp.'
    },
    servers: [{ url: `http://127.0.0.1:${cfg.port}` }],
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } }
    },
    paths: {
      '/api/v1/ping': { get: { summary: 'Health check (no auth)', responses: { '200': { description: 'OK' } } } },
      '/api/v1/stats': { get: p('Tree statistics') },
      '/api/v1/people': {
        get: p('List / search people', {
          params: [
            { name: 'q', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } }
          ]
        }),
        post: p('Create a person', { write: true, body: true })
      },
      '/api/v1/people/{id}': {
        get: p('Person detail (relations + events)', { params: [idParam] }),
        patch: p('Update person fields', { write: true, params: [idParam], body: true }),
        delete: p('Delete a person', { write: true, params: [idParam] })
      },
      '/api/v1/people/{id}/events': {
        get: p('Life events of a person', { params: [idParam] }),
        post: p('Add a life event', { write: true, params: [idParam], body: true })
      },
      '/api/v1/events/{id}': { delete: p('Delete a life event', { write: true, params: [idParam] }) },
      '/api/v1/families': {
        get: p('List families'),
        post: p('Create a family', { write: true, body: true })
      },
      '/api/v1/families/{id}': {
        get: p('Family detail', { params: [idParam] }),
        patch: p('Update family fields', { write: true, params: [idParam], body: true }),
        delete: p('Delete a family', { write: true, params: [idParam] })
      },
      '/api/v1/people/{id}/documents': {
        get: p('Documents attached to a person', { params: [idParam] })
      },
      '/api/v1/documents/{id}/file': {
        get: p('Raw document file (image/PDF binary)', { params: [idParam] })
      },
      '/api/v1/places': { get: p('Geocoded places') },
      '/api/v1/pedigree': {
        get: p('Pedigree tree of couples', {
          params: [{ name: 'rootId', in: 'query', schema: { type: 'string' } }]
        })
      },
      '/api/v1/atlas/points': { get: p('Every geocoded life event') },
      '/api/v1/export/gedcom': { get: p('Full GEDCOM export (text)') },
      '/mcp': {
        post: {
          summary: 'Model Context Protocol endpoint (Streamable HTTP) — connect AI assistants',
          security: [{ bearer: [] }],
          responses: { '200': { description: 'JSON-RPC response' } }
        }
      }
    }
  }
}
