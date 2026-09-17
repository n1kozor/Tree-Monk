import { APP_LANGUAGES } from './languages'

const fold = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')

// ISO 3166-1 alpha-2 regions. Intl.DisplayNames supplies the labels in every
// UI language, so adding a country never means adding a one-off spelling here.
const REGION_CODES = `
AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ
BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ
DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR
GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY
HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP
KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY
MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ
NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT
PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST
SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ
VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW
`.trim().split(/\s+/)

/** Spellings recognised as aliases: English plus every UI language. */
const ALIAS_LOCALES = ['en', ...APP_LANGUAGES.filter((lang) => lang !== 'en')]

const displayCache = new Map<string, Intl.DisplayNames>()
function displayNames(lang: string): Intl.DisplayNames {
  let d = displayCache.get(lang)
  if (!d) {
    try {
      d = new Intl.DisplayNames([lang], { type: 'region' })
    } catch {
      d = new Intl.DisplayNames(['en'], { type: 'region' })
    }
    displayCache.set(lang, d)
  }
  return d
}

/** Folded label in any recognised language → ISO code. */
function buildCountryCodes(): Map<string, string> {
  const codes = new Map<string, string>()
  const displays = ALIAS_LOCALES.map(displayNames)
  const add = (label: string | undefined, code: string): void => {
    if (!label) return
    const key = fold(label)
    const existing = codes.get(key)
    // A localized label can be ambiguous (notably Congo). Keep ambiguous labels
    // unresolved instead of silently assigning them to the wrong country.
    if (existing && existing !== code) {
      codes.delete(key)
      return
    }
    codes.set(key, code)
  }
  for (const code of REGION_CODES) for (const display of displays) add(display.of(code), code)
  return codes
}

const COUNTRY_CODES = buildCountryCodes()

/** ISO 3166-1 alpha-2 code of a country label in any recognised language, or null. */
export function countryCode(country: string | null | undefined): string | null {
  const raw = country?.trim()
  if (!raw) return null
  return COUNTRY_CODES.get(fold(raw)) ?? null
}

/** The country's name in `lang` (the UI language; English by default — the
 *  language-neutral form the main process matches on). */
export function countryDisplayName(code: string, lang = 'en'): string {
  return displayNames(lang).of(code) ?? code
}

/** Canonical spelling of a country label in `lang`; unknown labels pass through. */
export function canonicalCountryName(country: string | null | undefined, lang = 'en'): string | null {
  const raw = country?.trim()
  if (!raw) return null
  const code = COUNTRY_CODES.get(fold(raw))
  return code ? countryDisplayName(code, lang) : raw
}

/** Like canonicalCountryName, but null when the label is not a known country. */
export function knownCountryAlias(country: string | null | undefined, lang = 'en'): string | null {
  const code = countryCode(country)
  return code ? countryDisplayName(code, lang) : null
}

export function lastPlacePart(place: string | null | undefined): string | null {
  const raw = place?.trim()
  if (!raw) return null
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean)
  return parts.at(-1) ?? null
}

/** "São Paulo, Brasil" → "São Paulo, Brazil" (or "São Paulo, Brazília" for
 *  lang 'hu'): only the trailing country component is rewritten, everything
 *  else stays exactly as typed. */
export function canonicalizeCountryInPlace(place: string | null | undefined, lang = 'en'): string {
  const raw = place?.trim()
  if (!raw) return ''
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return raw
  const country = canonicalCountryName(parts.at(-1), lang)
  if (!country) return raw
  parts[parts.length - 1] = country
  return parts.join(', ')
}
