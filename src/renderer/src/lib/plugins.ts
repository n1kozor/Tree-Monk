import type { AppLanguage } from '@shared/types'
import { resolveAppLanguage } from '@shared/languages'

/** Resolve a plugin's localized string (string, or {hu,en,de,fr} with fallbacks). */
export function localizedPluginText(
  v: string | Partial<Record<AppLanguage, string>> | undefined,
  lang: string
): string {
  if (!v) return ''
  if (typeof v === 'string') return v
  const code = resolveAppLanguage(lang)
  return v[code] ?? v.en ?? v.hu ?? v.de ?? Object.values(v)[0] ?? ''
}
