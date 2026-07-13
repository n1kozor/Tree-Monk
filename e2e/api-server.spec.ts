import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * Boots the real app with the local API force-enabled via env (the same
 * override users can script with), then talks to it over plain HTTP from the
 * test process: auth, reads, writes and a full MCP round-trip.
 */

const PORT = 27117
const TOKEN = 'e2e-test-token'
const BASE = `http://127.0.0.1:${PORT}`
const AUTH = { Authorization: `Bearer ${TOKEN}` }

let app: ElectronApplication

test.beforeAll(async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'treemonk-api-e2e-'))
  app = await electron.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      TREEMONK_API: '1',
      TREEMONK_API_PORT: String(PORT),
      TREEMONK_API_TOKEN: TOKEN,
      TREEMONK_API_WRITES: '1',
      TREEMONK_API_MCP: '1'
    }
  })
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  // Wait until the server answers.
  await expect(async () => {
    const r = await fetch(`${BASE}/api/v1/ping`)
    expect(r.ok).toBe(true)
  }).toPass({ timeout: 20_000 })
})

test.afterAll(async () => {
  await app.close()
})

test('ping is open, data routes demand the token', async () => {
  const ping = await (await fetch(`${BASE}/api/v1/ping`)).json()
  expect(ping.name).toBe('TreeMonk')

  const noAuth = await fetch(`${BASE}/api/v1/people`)
  expect(noAuth.status).toBe(401)

  const badAuth = await fetch(`${BASE}/api/v1/people`, { headers: { Authorization: 'Bearer wrong' } })
  expect(badAuth.status).toBe(401)
})

test('docs and openapi are served', async () => {
  const docs = await fetch(`${BASE}/docs`)
  expect(docs.status).toBe(200)
  expect(await docs.text()).toContain('TreeMonk Local API')
  const spec = await (await fetch(`${BASE}/api/v1/openapi.json`)).json()
  expect(spec.openapi).toBe('3.1.0')
  expect(Object.keys(spec.paths).length).toBeGreaterThan(8)
})

test('write → read → delete round-trip', async () => {
  const created = await (
    await fetch(`${BASE}/api/v1/people`, {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ givenName: 'API', surname: 'Teszt', sex: 'F', birthDate: '1901-02-03' })
    })
  ).json()
  expect(created.id).toBeTruthy()
  expect(created.surname).toBe('Teszt')

  const list = await (await fetch(`${BASE}/api/v1/people?q=teszt`, { headers: AUTH })).json()
  expect(list.items.some((p: { id: string }) => p.id === created.id)).toBe(true)

  const detail = await (await fetch(`${BASE}/api/v1/people/${created.id}`, { headers: AUTH })).json()
  expect(detail.person.birthDate).toBe('1901-02-03')

  const patched = await (
    await fetch(`${BASE}/api/v1/people/${created.id}`, {
      method: 'PATCH',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ birthPlace: 'Kecskemét' })
    })
  ).json()
  expect(patched.birthPlace).toBe('Kecskemét')

  const del = await fetch(`${BASE}/api/v1/people/${created.id}`, { method: 'DELETE', headers: AUTH })
  expect(del.status).toBe(200)
  const gone = await fetch(`${BASE}/api/v1/people/${created.id}`, { headers: AUTH })
  expect(gone.status).toBe(404)
})

test('document routes exist and guard correctly', async () => {
  // Unknown document → 404; person-documents on a fresh person → empty list.
  const missing = await fetch(`${BASE}/api/v1/documents/nope/file`, { headers: AUTH })
  expect(missing.status).toBe(404)

  const created = await (
    await fetch(`${BASE}/api/v1/people`, {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ givenName: 'Doc', surname: 'Teszt' })
    })
  ).json()
  const docs = await (await fetch(`${BASE}/api/v1/people/${created.id}/documents`, { headers: AUTH })).json()
  expect(Array.isArray(docs)).toBe(true)
  expect(docs.length).toBe(0)
  await fetch(`${BASE}/api/v1/people/${created.id}`, { method: 'DELETE', headers: AUTH })
})

test('stats and gedcom export respond', async () => {
  const stats = await (await fetch(`${BASE}/api/v1/stats`, { headers: AUTH })).json()
  expect(typeof stats.people).toBe('number')
  const ged = await (await fetch(`${BASE}/api/v1/export/gedcom`, { headers: AUTH })).json()
  expect(ged.gedcom).toContain('0 HEAD')
})

/** One stateless MCP JSON-RPC exchange. */
async function mcp(body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: {
      ...AUTH,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream'
    },
    body: JSON.stringify(body)
  })
  expect(res.ok).toBe(true)
  return (await res.json()) as Record<string, unknown>
}

test('MCP: initialize, list tools, call a tool', async () => {
  const init = await mcp({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'e2e', version: '1.0' }
    }
  })
  const initResult = init.result as { serverInfo: { name: string } }
  expect(initResult.serverInfo.name).toBe('treemonk')

  const tools = await mcp({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
  const names = (tools.result as { tools: { name: string }[] }).tools.map((t) => t.name)
  expect(names).toContain('search_people')
  expect(names).toContain('get_statistics')
  expect(names).toContain('list_documents')
  expect(names).toContain('get_document_image')
  expect(names).toContain('create_person') // writes are enabled via env

  // Create through MCP, then find them through MCP.
  const created = await mcp({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'create_person', arguments: { given_name: 'Mcp', surname: 'Próba', sex: 'M' } }
  })
  const createdText = (created.result as { content: { text: string }[] }).content[0].text
  expect(createdText).toContain('Próba')

  const found = await mcp({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: { name: 'search_people', arguments: { query: 'próba', limit: 5 } }
  })
  const foundText = (found.result as { content: { text: string }[] }).content[0].text
  expect(foundText).toContain('Mcp Próba')
})
