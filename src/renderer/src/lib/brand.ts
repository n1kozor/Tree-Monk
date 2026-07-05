/** TreeMonk brand palette — the teal pair the launch sprout/canopy is built on.
 *  Shared so the logo, splash and any brand surface stay in perfect sync. */
export const BRAND = {
  teal: '#16c2ad',
  tealLight: '#35d6c4',
  deep: '#0d7a6e',
  ink: '#2b3a36'
} as const

/** The signature wordmark gradient. */
export const BRAND_GRADIENT = `linear-gradient(90deg, ${BRAND.teal}, ${BRAND.tealLight})`
