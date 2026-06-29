import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * Launches the REAL built TreeMonk app against a throwaway userData directory.
 * TreeMonk keeps its database under app.getPath('userData'), and Electron's
 * --user-data-dir switch redirects that — so every test run starts from a fresh,
 * empty database and NEVER touches the user's real genealogy data.
 */
export async function launchApp(): Promise<{ app: ElectronApplication; window: Page }> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'treemonk-e2e-'))
  const app = await electron.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`]
  })
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  // The React shell has mounted once the sidebar navigation is on screen.
  await window.getByTestId('nav-map').waitFor({ state: 'visible' })
  return { app, window }
}

/** Every sidebar view that renders without needing imported data. */
export const VIEWS = [
  'board',
  'dashboard',
  'tree',
  'map',
  'people',
  'documents',
  'issues',
  'query',
  'kinship',
  'famous',
  'audit',
  'settings'
] as const
