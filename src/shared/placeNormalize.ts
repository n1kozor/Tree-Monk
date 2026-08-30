import { APP_LANGUAGES } from './languages'

const fold = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')

// ISO 3166-1 alpha-2 regions. Intl.DisplayNames supplies the canonical English
// label and localized aliases, so adding a country never means adding a
// one-off spelling to this module.
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

const COUNTRY_LOCALES = ['en', ...APP_LANGUAGES.filter((lang) => lang !== 'en')]

function buildCountryAliases(): Map<string, string> {
  const aliases = new Map<string, string>()
  const displays = COUNTRY_LOCALES.map((locale) => new Intl.DisplayNames([locale], { type: 'region' }))

  const add = (label: string | undefined, canonical: string): void => {
    if (!label) return
    const key = fold(label)
    const existing = aliases.get(key)
    // A localized label can be ambiguous (notably Congo). Keep ambiguous labels
    // unresolved instead of silently assigning them to the wrong country.
    if (existing && existing !== canonical) {
      aliases.delete(key)
      return
    }
    aliases.set(key, canonical)
  }

  for (const code of REGION_CODES) {
    const canonical = displays[0].of(code)
    if (!canonical) continue
    add(canonical, canonical)
    for (const display of displays.slice(1)) add(display.of(code), canonical)
  }
  return aliases
}

const COUNTRY_ALIASES = buildCountryAliases()

export function canonicalCountryName(country: string | null | undefined): string | null {
  const raw = country?.trim()
  if (!raw) return null
  return COUNTRY_ALIASES.get(fold(raw)) ?? raw
}

export function knownCountryAlias(country: string | null | undefined): string | null {
  const raw = country?.trim()
  if (!raw) return null
  return COUNTRY_ALIASES.get(fold(raw)) ?? null
}

export function lastPlacePart(place: string | null | undefined): string | null {
  const raw = place?.trim()
  if (!raw) return null
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean)
  return parts.at(-1) ?? null
}

export function canonicalizeCountryInPlace(place: string | null | undefined): string {
  const raw = place?.trim()
  if (!raw) return ''
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return raw
  const country = canonicalCountryName(parts.at(-1))
  if (!country) return raw
  parts[parts.length - 1] = country
  return parts.join(', ')
}
