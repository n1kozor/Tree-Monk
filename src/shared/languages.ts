import type { AppLanguage } from './types'

export const APP_LANGUAGES: readonly AppLanguage[] = ['hu', 'en', 'de', 'fr']
const APP_LANGUAGE_SET = new Set<string>(APP_LANGUAGES)

export function isAppLanguage(value: string): value is AppLanguage {
  return APP_LANGUAGE_SET.has(value)
}

export function resolveAppLanguage(value: string): AppLanguage {
  const code = value.slice(0, 2).toLowerCase()
  return isAppLanguage(code) ? code : 'en'
}
