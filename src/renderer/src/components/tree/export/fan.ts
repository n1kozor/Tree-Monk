// Full fan-chart → SVG. A string port of the on-screen FanChart: concentric
// generation rings of ancestor wedges with curved labels, recentred into a
// positive `0 0 size size` box so the poster wrapper can place it.
import { arc as d3arc } from 'd3-shape'
import type { TreeNodeDatum } from '@shared/types'
import { canonicalCountryName } from '@shared/placeNormalize'
import { formatName } from '@/lib/utils'
import { PRINT, esc, truncate, type ExportContent, type TreeSvg } from './svgKit'

const TAU = Math.PI * 2
const R0 = 64
const RING = 80

interface Wedge {
  id: string
  datum: TreeNodeDatum
  gen: number
  a0: number
  a1: number
}

function pointAt(r: number, a: number): [number, number] {
  return [r * Math.sin(a), -r * Math.cos(a)]
}

const GEN_HUES = [212, 250, 286, 330, 8, 40, 158, 186]
const COUNTRY_HUES = [168, 36, 212, 334, 78, 266, 16, 196, 118, 308, 46, 226, 356, 144]

function hashText(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0
  return h
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function countryFromPlace(place: string | null | undefined): string | null {
  const raw = place?.trim()
  if (!raw) return null
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean)
  return canonicalCountryName(parts.at(-1))
}

function countryOf(datum: TreeNodeDatum): string | null {
  return datum.country ?? countryFromPlace(datum.birthPlace) ?? countryFromPlace(datum.deathPlace)
}

function fillFor(datum: TreeNodeDatum, gen: number, content: ExportContent): string {
  const fade = Math.max(0.18, 0.5 - gen * 0.05)
  if (content.fanColorMode === 'generation') {
    const h = GEN_HUES[(gen - 1) % GEN_HUES.length]
    return `hsla(${h},64%,56%,${fade})`
  }
  if (content.fanColorMode === 'country') {
    const country = countryOf(datum)
    if (!country) return `rgba(148,163,184,${Math.max(0.13, fade * 0.72)})`
    const h = COUNTRY_HUES[hashText(country.toLowerCase()) % COUNTRY_HUES.length]
    return `hsla(${h},68%,50%,${fade})`
  }
  if (content.fanColorMode === 'mono') {
    const rgb = hexToRgb(content.accent) ?? [71, 85, 105]
    return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${fade})`
  }
  const base = datum.sex === 'F' ? [244, 114, 182] : datum.sex === 'M' ? [45, 212, 191] : [148, 163, 184]
  return `rgba(${base[0]},${base[1]},${base[2]},${fade})`
}

export function buildFanTreeSvg(
  data: TreeNodeDatum,
  generations: number,
  content: ExportContent
): TreeSvg {
  const wedges: Wedge[] = []
  let counter = 0
  const walk = (node: TreeNodeDatum, gen: number, a0: number, a1: number): void => {
    if (gen > 0) wedges.push({ id: `w${counter++}`, datum: node, gen, a0, a1 })
    if (gen >= generations) return
    const kids = node.children ?? []
    const mid = (a0 + a1) / 2
    if (kids[0]) walk(kids[0], gen + 1, a0, mid)
    if (kids[1]) walk(kids[1], gen + 1, mid, a1)
  }
  walk(data, 0, 0, TAU)

  const maxR = R0 + generations * RING
  const pad = 18
  const size = (maxR + pad) * 2
  const cx = maxR + pad

  const arcGen = d3arc<{ inner: number; outer: number; a0: number; a1: number }>()
    .innerRadius((d) => d.inner)
    .outerRadius((d) => d.outer)
    .startAngle((d) => d.a0)
    .endAngle((d) => d.a1)
    .padAngle(0.006)
    .cornerRadius(2)

  const defsParts: string[] = []
  // Embed the chosen (self-hosted) font so the standalone export renders it.
  if (content.fanFontFaceCss) defsParts.push(`<style>${content.fanFontFaceCss}</style>`)
  const fills: string[] = []
  const labels: string[] = []

  for (const w of wedges) {
    const inner = R0 + (w.gen - 1) * RING
    const outer = R0 + w.gen * RING
    const d = arcGen({ inner, outer, a0: w.a0, a1: w.a1 }) ?? ''
    fills.push(
      `<path d="${d}" fill="${fillFor(w.datum, w.gen, content)}" stroke="#ffffff" stroke-width="1"/>`
    )

    // Curved text guides.
    const rName = (inner + outer) / 2 + (w.gen <= 2 ? 5 : 0)
    const rYear = rName - 13
    const mid = (w.a0 + w.a1) / 2
    const flip = Math.cos(mid) < 0
    const arcLine = (r: number): string => {
      const [x0, y0] = pointAt(r, w.a0)
      const [x1, y1] = pointAt(r, w.a1)
      const large = w.a1 - w.a0 > Math.PI ? 1 : 0
      return flip
        ? `M ${x1},${y1} A ${r},${r} 0 ${large} 0 ${x0},${y0}`
        : `M ${x0},${y0} A ${r},${r} 0 ${large} 1 ${x1},${y1}`
    }
    defsParts.push(`<path id="${w.id}-name" d="${arcLine(rName)}" fill="none"/>`)
    if (w.gen <= 3) defsParts.push(`<path id="${w.id}-year" d="${arcLine(rYear)}" fill="none"/>`)

    const arcLen = rName * (w.a1 - w.a0)
    const fontSize = w.gen <= 1 ? 13 : w.gen === 2 ? 12 : w.gen <= 4 ? 10.5 : 9
    const maxChars = Math.floor(arcLen / (fontSize * 0.62))
    if (maxChars < 2) continue
    const name =
      content.hideLiving && !w.datum.deathYear && !w.datum.birthYear
        ? content.livingLabel
        : formatName(w.datum.given, w.datum.surname) || w.datum.name
    const given = w.datum.given || name.split(' ')[0]
    const label = w.gen <= 2 ? truncate(name, maxChars) : truncate(given, maxChars)
    labels.push(
      `<text font-size="${fontSize}" font-weight="${w.gen <= 1 ? 600 : 500}" fill="${PRINT.ink}">` +
        `<textPath href="#${w.id}-name" startOffset="50%" text-anchor="middle">${esc(label)}</textPath></text>`
    )
    if (content.dates && w.datum.birthYear && w.gen <= 3) {
      labels.push(
        `<text font-size="${fontSize - 2}" fill="${PRINT.muted}">` +
          `<textPath href="#${w.id}-year" startOffset="50%" text-anchor="middle">` +
          `${esc(w.datum.birthYear)}</textPath></text>`
      )
    }
  }

  // Central proband disc.
  const centerName = truncate(formatName(data.given, data.surname) || data.name, 16)
  const centerYear =
    content.dates && data.birthYear
      ? `${data.birthYear}${data.deathYear ? `–${data.deathYear}` : ''}`
      : ''
  const center =
    `<circle r="${R0}" fill="${PRINT.card}" stroke="${content.accent}" stroke-width="2"/>` +
    `<text text-anchor="middle" fill="${PRINT.ink}" font-weight="600">` +
    `<tspan x="0" dy="-0.2em" font-size="13">${esc(centerName)}</tspan>` +
    (centerYear
      ? `<tspan x="0" dy="1.4em" font-size="10" fill="${PRINT.muted}">${esc(centerYear)}</tspan>`
      : '') +
    `</text>`

  // Single-quote the attribute: family strings carry double quotes ("EB Garamond").
  const famAttr = content.fanFontFamily ? ` font-family='${content.fanFontFamily}'` : ''
  const inner =
    `<g transform="translate(${cx},${cx})"${famAttr}>` +
    fills.join('') +
    labels.join('') +
    center +
    `</g>`

  // The fan is radius-bounded (≤9 generations), so a single full-canvas piece is
  // always small enough — no per-tile splitting needed.
  return {
    defs: defsParts.join(''),
    width: size,
    height: size,
    pieces: [{ x: 0, y: 0, w: size, h: size, svg: inner }]
  }
}
