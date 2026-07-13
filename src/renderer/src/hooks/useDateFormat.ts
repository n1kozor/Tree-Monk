import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDisplayDate } from '@/lib/dates'
import { useSettings } from '@/store/useSettings'

/**
 * Returns a formatter that renders a STORED (ISO-ish) date in the user's chosen
 * display format (Settings → Appearance → Date format). Re-renders the caller
 * when the setting changes. Storage stays ISO — this is display-only.
 */
export function useDateFormat(): (date: string | null | undefined) => string {
  const fmt = useSettings((s) => s.dateFormat)
  return useCallback((date) => formatDisplayDate(date, fmt), [fmt])
}

/**
 * The localized date-input placeholder for the user's chosen format —
 * e.g. `ÉÉÉÉ-HH-NN` (iso), `NN.HH.ÉÉÉÉ` (eu), `HH/NN/ÉÉÉÉ` (us) in Hungarian.
 */
export function useDatePlaceholder(): string {
  const fmt = useSettings((s) => s.dateFormat)
  const { t } = useTranslation()
  return t(fmt === 'eu' ? 'person.dateHintEu' : fmt === 'us' ? 'person.dateHintUs' : 'person.dateHint')
}
