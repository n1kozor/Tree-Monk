import { app, shell } from 'electron'
import type { ReleaseEntry, UpdateInfo } from '@shared/types'

/** True when running as a Microsoft Store (MSIX/AppX) package. The Store
 *  delivers updates itself — and Store policy forbids self-updating — so the
 *  GitHub updater is fully dormant in that case (no checks, no downloads). */
const IS_STORE_BUILD = process.windowsStore === true

/** Public GitHub repository that publishes TreeMonk releases. */
const REPO = 'n1kozor/Tree-Monk'
const LATEST_RELEASE_URL = `https://api.github.com/repos/${REPO}/releases/latest`
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases?per_page=100`

interface GhAsset {
  name: string
  browser_download_url: string
}
interface GhRelease {
  tag_name: string
  name: string | null
  body: string | null
  html_url: string
  published_at: string
  draft: boolean
  prerelease: boolean
  assets: GhAsset[]
}

/** Split a semver-ish string ("v1.2.3", "1.2.3-beta") into comparable numbers. */
function parseVersion(v: string): number[] {
  const core = v.replace(/^v/i, '').split('-')[0].split('+')[0]
  return core.split('.').map((n) => parseInt(n, 10) || 0)
}

/** True when `latest` is strictly newer than `current` (component-wise semver). */
function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest)
  const b = parseVersion(current)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x !== y) return x > y
  }
  return false
}

/** The installer asset matching the current OS (Windows .exe / macOS .dmg / Linux .AppImage). */
function platformAsset(assets: GhAsset[]): string | null {
  const ext =
    process.platform === 'win32'
      ? /\.exe$/i
      : process.platform === 'darwin'
        ? /\.dmg$/i
        : /\.AppImage$/i
  return assets.find((a) => ext.test(a.name))?.browser_download_url ?? null
}

export function currentVersion(): string {
  return app.getVersion()
}

/** Queries GitHub's "latest release" endpoint (public, no auth) and compares it
 *  to the running version. Network/parse failures degrade to "no update". */
export async function checkForUpdates(): Promise<UpdateInfo> {
  const current = app.getVersion()
  const base: UpdateInfo = {
    current,
    store: IS_STORE_BUILD,
    latest: null,
    hasUpdate: false,
    notes: null,
    url: null,
    publishedAt: null,
    assetUrl: null
  }
  if (IS_STORE_BUILD) return base
  try {
    const res = await fetch(LATEST_RELEASE_URL, {
      headers: {
        'User-Agent': `TreeMonk/${current}`,
        Accept: 'application/vnd.github+json'
      }
    })
    if (!res.ok) return base
    const rel = (await res.json()) as GhRelease
    if (!rel?.tag_name || rel.draft) return base
    const latest = rel.tag_name.replace(/^v/i, '')
    return {
      current,
      store: IS_STORE_BUILD,
      latest,
      hasUpdate: isNewer(latest, current),
      notes: rel.body ?? null,
      url: rel.html_url ?? null,
      publishedAt: rel.published_at ?? null,
      assetUrl: platformAsset(rel.assets ?? [])
    }
  } catch {
    return base
  }
}

/** Fetches the full published release history (newest first) for the changelog
 *  view. Drafts are skipped; network/parse failures degrade to an empty list. */
export async function listReleases(): Promise<ReleaseEntry[]> {
  const current = app.getVersion()
  try {
    const res = await fetch(RELEASES_URL, {
      headers: {
        'User-Agent': `TreeMonk/${current}`,
        Accept: 'application/vnd.github+json'
      }
    })
    if (!res.ok) return []
    const rels = (await res.json()) as GhRelease[]
    if (!Array.isArray(rels)) return []
    return rels
      .filter((r) => r?.tag_name && !r.draft)
      .map((r) => ({
        version: r.tag_name.replace(/^v/i, ''),
        name: r.name ?? null,
        body: r.body ?? null,
        url: r.html_url ?? null,
        publishedAt: r.published_at ?? null,
        prerelease: !!r.prerelease
      }))
      .sort((a, b) => {
        const av = parseVersion(a.version)
        const bv = parseVersion(b.version)
        for (let i = 0; i < Math.max(av.length, bv.length); i++) {
          const x = av[i] ?? 0
          const y = bv[i] ?? 0
          if (x !== y) return y - x
        }
        return 0
      })
  } catch {
    return []
  }
}

/** Opens the latest installer for this OS (or, failing that, the release page)
 *  in the user's browser so they can download and run the update. */
export async function openUpdateDownload(): Promise<void> {
  if (IS_STORE_BUILD) return // the Store handles updates
  const info = await checkForUpdates()
  const target = info.assetUrl || info.url
  if (target && /^https?:\/\//i.test(target)) await shell.openExternal(target)
}
