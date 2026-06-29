function hash(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Deterministic small rotation (-3deg .. +3deg) derived from a node id,
 *  so corkboard items keep a stable "pinned by hand" tilt across renders. */
export function rotationFor(id: string): number {
  return ((hash(id) % 61) - 30) / 10
}

const PIN_COLORS = [
  '#e23b3b', // red
  '#2f7df6', // blue
  '#22a558', // green
  '#e7b008', // amber
  '#9b4dde', // purple
  '#f1762a', // orange
  '#16b6c9', // teal
  '#d6336c' // raspberry
] as const

/** Stable pushpin colour per seed, so pins look hand-placed (not uniform). */
export function pinColor(seed: string): string {
  return PIN_COLORS[hash(seed) % PIN_COLORS.length]
}

/** Deterministic hand-placed jitter (px) so a pin never sits dead-centre on a
 *  handle — it looks pressed in by hand, slightly off. */
export function jitterFor(seed: string): { dx: number; dy: number } {
  const h = hash(seed)
  return { dx: ((h % 11) - 5) * 0.8, dy: (((h >> 4) % 11) - 5) * 0.8 }
}

/** Deterministic pin tilt (-22deg .. +22deg) — pushpins are never perfectly upright. */
export function tiltFor(seed: string): number {
  return ((hash(seed) % 45) - 22) * 1.05
}
