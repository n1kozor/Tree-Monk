import i18n from '@/i18n'
import { normalizeDate } from '@/lib/dates'
import { isFsMode } from '@/lib/fsMode'

/**
 * Date normalization that follows the app mode: in FamilySearch mode (signed
 * in) the FamilySearch Date authority formats the date IN THE UI LANGUAGE;
 * otherwise (or when the authority cannot parse it) the local normalizer runs.
 */
export async function smartNormalizeDate(raw: string): Promise<string> {
  const text = raw.trim()
  if (!text) return ''
  if (isFsMode()) {
    try {
      const fs = await window.api.familysearch.normalizeDate(text, i18n.language)
      if (fs) return fs
    } catch {
      /* fall back to the local normalizer */
    }
  }
  return normalizeDate(text)
}
