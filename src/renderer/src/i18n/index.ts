import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import hu from './locales/hu.json'
import en from './locales/en.json'
import de from './locales/de.json'
import type { AppLanguage } from '@shared/types'

export const LANGUAGES: { code: AppLanguage; label: string; flag: string }[] = [
  { code: 'hu', label: 'Magyar', flag: '🇭🇺' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' }
]

const STORAGE_KEY = 'treemonk.lang'

function initialLang(): AppLanguage {
  const stored = localStorage.getItem(STORAGE_KEY) as AppLanguage | null
  if (stored && LANGUAGES.some((l) => l.code === stored)) return stored
  // No saved choice yet → follow the OS / browser language if we support it…
  const sys = (navigator.language || '').slice(0, 2).toLowerCase()
  if (LANGUAGES.some((l) => l.code === sys)) return sys as AppLanguage
  return 'hu' // …otherwise Hungarian.
}

i18n.use(initReactI18next).init({
  resources: {
    hu: { translation: hu },
    en: { translation: en },
    de: { translation: de }
  },
  lng: initialLang(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }
})

export function setLanguage(lang: AppLanguage): void {
  localStorage.setItem(STORAGE_KEY, lang)
  i18n.changeLanguage(lang)
  document.documentElement.lang = lang
  // Let the main process know so geocoding returns place names in this language.
  void window.api?.app?.setLanguage?.(lang)
}

// Sync the initial language to the main process on startup too.
void window.api?.app?.setLanguage?.(initialLang())

export default i18n
