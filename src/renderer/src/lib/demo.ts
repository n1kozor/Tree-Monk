/**
 * True only in the read-only browser demo build (treemonk.eu/demo). The web
 * entry sets `window.__TREEMONK_DEMO__`; in the Electron app it is undefined.
 * Used to hide features that make no sense in a read-only sample (FamilySearch
 * import, GEDCOM import, etc.).
 */
export function isDemo(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window as unknown as { __TREEMONK_DEMO__?: boolean }).__TREEMONK_DEMO__ === true
  )
}
