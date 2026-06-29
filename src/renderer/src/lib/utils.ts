import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import i18n from '@/i18n'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * Orders a name per the active UI language: Hungarian puts the family name
 * FIRST (`Vezeték Keresztnév`), every other language keeps `Given Surname`.
 */
export function formatName(given?: string | null, surname?: string | null): string {
  const g = (given ?? '').trim()
  const s = (surname ?? '').trim()
  // Empty → return '' so callers can fall back to a pre-built combined name.
  if (!g && !s) return ''
  if (!g) return s
  if (!s) return g
  return i18n.language === 'hu' ? `${s} ${g}` : `${g} ${s}`
}

/** Extracts a 4-digit year from a free-form date string. */
export function yearOf(date?: string | null): string {
  if (!date) return ''
  const m = date.match(/\d{4}/)
  return m ? m[0] : ''
}

export function fullName(p: { givenName: string; surname: string }): string {
  return formatName(p.givenName, p.surname) || '—'
}

export function initials(p: { givenName: string; surname: string }): string {
  const a = p.givenName?.[0] ?? ''
  const b = p.surname?.[0] ?? ''
  return (a + b).toUpperCase() || '?'
}
