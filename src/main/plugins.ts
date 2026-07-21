import { app, dialog, BrowserWindow } from 'electron'
import AdmZip from 'adm-zip'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, normalize, resolve, sep } from 'node:path'
import type { InstalledPlugin, PluginManifest, PluginPanelInfo, PluginScope } from '@shared/types'
import { getApiConfig, restartApiServer } from './api/server'

/**
 * Plugins are sandboxed web panels that may ONLY talk to the local API.
 *
 * Security model:
 * - A plugin is a folder (installed from a .zip): manifest.json + HTML/JS.
 * - Its panel runs in a sandboxed <iframe> served over tmplugin:// whose CSP
 *   allows network access to 127.0.0.1 ONLY — data cannot leave the machine.
 * - Each plugin gets its OWN API token, scoped to the permissions the
 *   manifest declared (read / write / documents) — never the user's main
 *   token.
 * - Installed plugins start DISABLED; the user flips them on in Settings
 *   after seeing the requested permissions.
 */

const SCOPES: PluginScope[] = ['read', 'write', 'documents']
const ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/
const ENTRY_RE = /^[\w./-]+\.html$/
const ICON_FILE_RE = /^[\w./-]+\.(svg|png|webp)$/i

export function pluginsDir(): string {
  const dir = join(app.getPath('userData'), 'plugins')
  mkdirSync(dir, { recursive: true })
  return dir
}

// ---- Registry: enabled state + per-plugin tokens (never inside the zip) ----

interface RegistryEntry {
  enabled: boolean
  token: string
}
type Registry = Record<string, RegistryEntry>

function registryPath(): string {
  return join(pluginsDir(), 'plugins.json')
}

let registry: Registry | null = null

function loadRegistry(): Registry {
  if (registry) return registry
  try {
    registry = JSON.parse(readFileSync(registryPath(), 'utf-8')) as Registry
  } catch {
    registry = {}
  }
  return registry
}

function persistRegistry(): void {
  if (registry) writeFileSync(registryPath(), JSON.stringify(registry, null, 2), 'utf-8')
}

// ---- Manifest ----

/** TreeMonk ships in hu/en/de — user-facing plugin strings must too. */
function requireTrilingual(v: unknown, what: string): Partial<Record<'hu' | 'en' | 'de', string>> {
  const o = (v ?? {}) as Record<string, unknown>
  for (const lang of ['hu', 'en', 'de'] as const) {
    if (typeof o[lang] !== 'string' || !(o[lang] as string).trim())
      throw new Error(`${what} must be given in all three languages ({ "hu": …, "en": …, "de": … })`)
  }
  return { hu: String(o.hu).trim(), en: String(o.en).trim(), de: String(o.de).trim() }
}

/** Validates an untrusted manifest.json; throws a user-readable error. */
export function validateManifest(raw: unknown): PluginManifest {
  const m = (raw ?? {}) as Record<string, unknown>
  if (typeof m.id !== 'string' || !ID_RE.test(m.id))
    throw new Error('manifest.id must be lowercase letters/digits/dashes (2–64 chars)')
  if (m.id === 'sdk') throw new Error('"sdk" is a reserved plugin id')
  if (typeof m.name !== 'string' || !m.name.trim()) throw new Error('manifest.name is required')
  if (typeof m.version !== 'string' || !m.version.trim()) throw new Error('manifest.version is required')
  const permissions = Array.isArray(m.permissions) ? (m.permissions as unknown[]) : []
  for (const s of permissions) if (!SCOPES.includes(s as PluginScope)) throw new Error(`Unknown permission: ${String(s)}`)
  const menuRaw = Array.isArray(m.menu) ? (m.menu as Record<string, unknown>[]) : []
  if (!menuRaw.length) throw new Error('manifest.menu needs at least one entry')
  const menu = menuRaw.map((e) => {
    if (typeof e.id !== 'string' || !ID_RE.test(e.id)) throw new Error('menu entry id must be a slug')
    if (typeof e.entry !== 'string' || !ENTRY_RE.test(e.entry) || e.entry.includes('..'))
      throw new Error(`menu entry "${e.id}" needs a relative .html entry file`)
    const title = requireTrilingual(e.title, `menu entry "${e.id}" title`)
    return { id: e.id, title, entry: e.entry }
  })
  return {
    id: m.id,
    name: m.name.trim(),
    version: m.version.trim(),
    author: typeof m.author === 'string' ? m.author : undefined,
    description: requireTrilingual(m.description, 'description'),
    // Icon: an image file inside the plugin (rendered like the app's own
    // stroke icons) or an emoji. A traversal-y path is dropped, not fatal.
    icon:
      typeof m.icon === 'string'
        ? ICON_FILE_RE.test(m.icon) && !m.icon.includes('..')
          ? m.icon
          : m.icon.includes('.')
            ? undefined
            : m.icon.slice(0, 8)
        : undefined,
    permissions: permissions as PluginScope[],
    menu
  }
}

function readManifest(dir: string): PluginManifest | null {
  try {
    return validateManifest(JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8')))
  } catch {
    return null
  }
}

// ---- Listing / install / remove / enable ----

export function listPlugins(): InstalledPlugin[] {
  const reg = loadRegistry()
  const out: InstalledPlugin[] = []
  for (const name of readdirSync(pluginsDir(), { withFileTypes: true })) {
    if (!name.isDirectory()) continue
    const manifest = readManifest(join(pluginsDir(), name.name))
    if (!manifest || manifest.id !== name.name) continue
    out.push({ ...manifest, enabled: reg[manifest.id]?.enabled === true })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** Opens a picker for a plugin .zip and installs (or updates) it, DISABLED.
 *  `filePath` skips the picker — used by automated tests. */
export async function installPluginZip(
  win: BrowserWindow | null,
  filePath?: string
): Promise<InstalledPlugin | null> {
  let zipPath = filePath
  if (!zipPath) {
    const res = await dialog.showOpenDialog(win ?? undefined!, {
      title: 'Install TreeMonk plugin',
      properties: ['openFile'],
      filters: [{ name: 'Plugin (zip)', extensions: ['zip'] }]
    })
    if (res.canceled || !res.filePaths[0]) return null
    zipPath = res.filePaths[0]
  }

  const zip = new AdmZip(zipPath)
  // The manifest may sit at the zip root or inside a single top-level folder.
  const manifestEntry = zip
    .getEntries()
    .filter((e) => !e.isDirectory && e.entryName.replace(/\\/g, '/').endsWith('manifest.json'))
    .sort((a, b) => a.entryName.length - b.entryName.length)[0]
  if (!manifestEntry) throw new Error('manifest.json not found in the zip')
  const prefix = manifestEntry.entryName.replace(/\\/g, '/').slice(0, -'manifest.json'.length)
  const manifest = validateManifest(JSON.parse(manifestEntry.getData().toString('utf-8')))

  const dest = join(pluginsDir(), manifest.id)
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })
  for (const e of zip.getEntries()) {
    const entryName = e.entryName.replace(/\\/g, '/')
    if (e.isDirectory || !entryName.startsWith(prefix)) continue
    const rel = entryName.slice(prefix.length)
    if (!rel || rel.includes('..')) continue
    const target = resolve(dest, rel)
    // Zip-slip guard: every extracted file must stay inside the plugin folder.
    if (!target.startsWith(resolve(dest) + sep) && target !== resolve(dest)) continue
    mkdirSync(join(target, '..'), { recursive: true })
    writeFileSync(target, e.getData())
  }

  // A re-install keeps the previous enabled state + token (an update, not a reset).
  const reg = loadRegistry()
  if (!reg[manifest.id]) {
    reg[manifest.id] = { enabled: false, token: newToken() }
    persistRegistry()
  }
  return { ...manifest, enabled: reg[manifest.id].enabled }
}

export function removePlugin(id: string): void {
  if (!ID_RE.test(id)) return
  rmSync(join(pluginsDir(), id), { recursive: true, force: true })
  const reg = loadRegistry()
  if (reg[id]) {
    delete reg[id]
    persistRegistry()
  }
  restartApiServer()
}

export function setPluginEnabled(id: string, enabled: boolean): InstalledPlugin[] {
  const reg = loadRegistry()
  if (!reg[id]) reg[id] = { enabled: false, token: newToken() }
  reg[id].enabled = enabled
  persistRegistry()
  // The API server serves plugin panels — (re)start/stop it as needed.
  restartApiServer()
  return listPlugins()
}

function newToken(): string {
  return `plg_${randomBytes(24).toString('base64url')}`
}

// ---- Runtime lookups (called by the API server and the panel host) ----

export function anyPluginEnabled(): boolean {
  const reg = loadRegistry()
  return listPlugins().some((p) => reg[p.id]?.enabled)
}

/** Scopes for a presented Bearer token — null when it's no enabled plugin's token. */
export function pluginScopesForToken(token: string): PluginScope[] | null {
  if (!token.startsWith('plg_')) return null
  const reg = loadRegistry()
  for (const p of listPlugins()) {
    const entry = reg[p.id]
    if (entry?.enabled && entry.token === token) return p.permissions
  }
  return null
}

/** Boot info for one menu entry's sandboxed panel (null when disabled/unknown). */
export function pluginPanelInfo(pluginId: string, menuId: string): PluginPanelInfo | null {
  const reg = loadRegistry()
  const plugin = listPlugins().find((p) => p.id === pluginId)
  const entry = plugin?.menu.find((m) => m.id === menuId)
  if (!plugin || !entry || !reg[pluginId]?.enabled) return null
  return {
    url: `tmplugin://${pluginId}/${entry.entry}`,
    token: reg[pluginId].token,
    apiBase: `http://127.0.0.1:${getApiConfig().port}`
  }
}

/** Absolute file path for a tmplugin:// request — null when it escapes the folder. */
export function pluginFilePath(pluginId: string, relPath: string): string | null {
  if (!ID_RE.test(pluginId)) return null
  const base = resolve(pluginsDir(), pluginId)
  const target = resolve(base, normalize(relPath).replace(/^([/\\])+/, ''))
  if (target !== base && !target.startsWith(base + sep)) return null
  return existsSync(target) ? target : null
}
