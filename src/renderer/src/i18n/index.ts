import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import hu from './locales/hu.json'
import en from './locales/en.json'
import de from './locales/de.json'
import fr from './locales/fr.json'
import type { AppLanguage } from '@shared/types'
import { APP_LANGUAGES, isAppLanguage } from '@shared/languages'

const LANGUAGE_META: Record<AppLanguage, { label: string; flag: string }> = {
  hu: { label: 'Magyar', flag: '🇭🇺' },
  en: { label: 'English', flag: '🇬🇧' },
  de: { label: 'Deutsch', flag: '🇩🇪' },
  fr: { label: 'Français', flag: '🇫🇷' }
}

export const LANGUAGES = APP_LANGUAGES.map((code) => ({ code, ...LANGUAGE_META[code] }))

const STORAGE_KEY = 'treemonk.lang'

function initialLang(): AppLanguage {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored && isAppLanguage(stored)) return stored
  // No saved choice yet → follow the OS / browser language if we support it…
  const sys = (navigator.language || '').slice(0, 2).toLowerCase()
  if (isAppLanguage(sys)) return sys
  return 'hu' // …otherwise Hungarian.
}

i18n.use(initReactI18next).init({
  resources: {
    hu: { translation: hu },
    en: { translation: en },
    de: { translation: de },
    fr: { translation: fr }
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
