/** True inside the Electron desktop app, false in the browser webapp — the
 *  same renderer bundle serves both, and a few features (zip packages, file
 *  dialogs) only exist on the desktop. Electron's default user agent carries
 *  its own token, and TreeMonk never overrides it. */
export function isDesktopApp(): boolean {
  return typeof navigator !== 'undefined' && /\bElectron\//.test(navigator.userAgent)
}
