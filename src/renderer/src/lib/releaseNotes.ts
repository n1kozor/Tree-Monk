/**
 * Picks the language-specific slice of a GitHub release body.
 *
 * Convention (authored in the release notes on GitHub):
 *
 *   <!--lang:hu-->
 *   Magyar nyelvű változásnapló…
 *   <!--lang:en-->
 *   English changelog…
 *   <!--lang:de-->
 *   Deutsches Änderungsprotokoll…
 *
 * The markers are HTML comments, so they stay invisible on the GitHub release
 * page (which simply shows every language one after another), while the app
 * extracts only the section matching the current UI language. If no markers are
 * present the whole body is returned unchanged, so plain releases still work.
 *
 * @param body  Raw release body (markdown), or null.
 * @param lang  i18n language code (e.g. "hu", "en-US"); only the first 2 chars matter.
 */
export function localizeReleaseNotes(body: string | null | undefined, lang: string): string {
  if (!body) return ''
  const code = (lang || 'en').slice(0, 2).toLowerCase()
  const re = /<!--\s*lang:([a-z]{2})\s*-->/gi
  const matches = [...body.matchAll(re)]
  if (matches.length === 0) return body.trim()

  const sections: Record<string, string> = {}
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const tag = m[1].toLowerCase()
    const start = (m.index ?? 0) + m[0].length
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? body.length) : body.length
    sections[tag] = body.slice(start, end).trim()
  }
  // Preferred language → English fallback → first available → whole body.
  return sections[code] || sections.en || Object.values(sections)[0] || body.trim()
}
