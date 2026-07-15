import type { AppLanguage } from '@shared/types'

/** Resolve a plugin's localized string (string, or {hu,en,de} with fallbacks). */
export function localizedPluginText(
  v: string | Partial<Record<AppLanguage, string>> | undefined,
  lang: string
): string {
  if (!v) return ''
  if (typeof v === 'string') return v
  const code = lang.slice(0, 2) as AppLanguage
  return v[code] ?? v.en ?? v.hu ?? v.de ?? Object.values(v)[0] ?? ''
}
