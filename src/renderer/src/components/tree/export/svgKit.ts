// Shared helpers for building a print-ready, self-contained SVG of a family
// tree. Everything here emits plain SVG strings (no DOM, no React) so the same
// output can be written as a .svg file or rasterised to PDF by the main process.
import type { Sex } from '@shared/types'

/** Print-friendly palette: white paper, dark ink, soft sex tints. */
export const PRINT = {
  bg: '#ffffff',
  card: '#ffffff',
  border: '#d4d4d8',
  ink: '#18181b',
  muted: '#6b7280',
  faint: '#f4f4f5',
  male: '#0f766e',
  female: '#be185d',
  unknown: '#475569',
  maleBg: '#ccfbf1',
  femaleBg: '#fbcfe8',
  unknownBg: '#e2e8f0',
  badgeBg: '#e0e7ff',
  badgeInk: '#4338ca'
} as const

/**
 * A positioned, self-contained SVG fragment with its bounding box. Tiling only
 * emits the pieces that intersect each sheet, so a huge tree never instantiates
 * its whole content per page (which would blow up memory).
 */
export interface Piece {
  x: number
  y: number
  w: number
  h: number
  svg: string
}

/** A drawn sub-tree, in its own `0 0 width height` user space. */
export interface TreeSvg {
  defs: string
  width: number
  height: number
  pieces: Piece[]
}

/** Flattens pieces into one SVG body (for the whole-canvas SVG / single page). */
export function piecesInner(pieces: Piece[]): string {
  return pieces.map((p) => p.svg).join('')
}

/** Everything the dialog collects to flesh out the cards + poster chrome. */
export interface ExportContent {
  photos: boolean
  dates: boolean
  places: boolean
  docs: boolean
  hideLiving: boolean
  livingLabel: string
  deceasedLabel: string
  childrenLabel: string
  /** personId → avatar data URL (only populated when photos are included). */
  avatars: Map<string, string>
  title: string
  subtitle: string
  footerRight: string
  legend: { male: string; female: string; unknown: string; docs: string }
  /** Connector colour (resolved hex). */
  accent: string
  /** Text/line colours for elements ON the page background (flip on a dark bg). */
  ink: string
  muted: string
  border: string
}

const XML_ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;'
}

export function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => XML_ESC[c])
}

/** Rough monospace-free width estimate so labels fit their slot. */
export function truncate(s: string, maxChars: number): string {
  if (maxChars <= 0) return ''
  return s.length > maxChars ? s.slice(0, Math.max(1, maxChars - 1)) + '…' : s
}

export function fitChars(widthPx: number, fontSize: number): number {
  return Math.floor(widthPx / (fontSize * 0.56))
}

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  )
}

export function tint(sex: Sex): { fg: string; bg: string } {
  if (sex === 'F') return { fg: PRINT.female, bg: PRINT.femaleBg }
  if (sex === 'M') return { fg: PRINT.male, bg: PRINT.maleBg }
  return { fg: PRINT.unknown, bg: PRINT.unknownBg }
}

/** Shared circular clip so a square photo renders as a round avatar. */
export const AVATAR_CLIP_DEF =
  '<clipPath id="tm-avatar" clipPathUnits="objectBoundingBox">' +
  '<circle cx="0.5" cy="0.5" r="0.5"/></clipPath>'

/** A round avatar at (cx,cy): the photo when available, else tinted initials. */
export function avatarSvg(
  cx: number,
  cy: number,
  r: number,
  name: string,
  sex: Sex,
  personId: string | undefined,
  content: ExportContent
): string {
  const url = content.photos && personId ? content.avatars.get(personId) : undefined
  if (url) {
    return (
      `<image href="${esc(url)}" x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" ` +
      `preserveAspectRatio="xMidYMid slice" clip-path="url(#tm-avatar)"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${PRINT.border}" stroke-width="1"/>`
    )
  }
  const { fg, bg } = tint(sex)
  return (
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${bg}"/>` +
    `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" ` +
    `font-size="${Math.round(r * 0.9)}" font-weight="600" fill="${fg}">${esc(initials(name))}</text>`
  )
}

/** A small "N documents" pill with a mini document glyph, right-aligned to `rightX`. */
export function docBadge(n: number, rightX: number, topY: number): string {
  const txt = String(n)
  const w = 22 + txt.length * 6
  const x = rightX - w
  const icon =
    `<path d="M${x + 6} ${topY + 3} h6 l2 2 v8 h-8 z" fill="none" ` +
    `stroke="${PRINT.badgeInk}" stroke-width="1"/>`
  return (
    `<g>` +
    `<rect x="${x}" y="${topY}" width="${w}" height="15" rx="4" fill="${PRINT.badgeBg}"/>` +
    icon +
    `<text x="${x + 16}" y="${topY + 11}" font-size="9" font-weight="600" ` +
    `fill="${PRINT.badgeInk}">${esc(txt)}</text>` +
    `</g>`
  )
}

const FONT = "'Inter','Helvetica Neue',Arial,sans-serif"

/**
 * Wraps a drawn sub-tree with a title header, a sex/legend strip and a footer,
 * producing the final poster-sized, tile-friendly piece list.
 */
export function wrapPoster(content: ExportContent, tree: TreeSvg): TreeSvg {
  const SIDE = 48
  const headerH = content.title ? 104 : 32
  const footerH = 52
  const width = tree.width + SIDE * 2
  const height = headerH + tree.height + footerH
  const pieces: Piece[] = []

  // ---- Header (one piece spanning the top band) ----
  if (content.title) {
    let h =
      `<text x="${SIDE}" y="56" font-size="30" font-weight="700" fill="${content.ink}">` +
      `${esc(content.title)}</text>`
    if (content.subtitle) {
      h += `<text x="${SIDE}" y="82" font-size="15" fill="${content.muted}">${esc(content.subtitle)}</text>`
    }
    h += `<line x1="${SIDE}" y1="${headerH - 12}" x2="${width - SIDE}" y2="${headerH - 12}" stroke="${content.border}" stroke-width="1"/>`
    pieces.push({ x: 0, y: 0, w: width, h: headerH, svg: h })
  }

  // ---- The tree itself: shift every piece down/right by the margins. ----
  for (const p of tree.pieces) {
    pieces.push({
      x: p.x + SIDE,
      y: p.y + headerH,
      w: p.w,
      h: p.h,
      svg: `<g transform="translate(${SIDE},${headerH})">${p.svg}</g>`
    })
  }

  // ---- Footer (one piece): legend (left) + caption (right) ----
  const fLineY = headerH + tree.height + 8
  const fy = headerH + tree.height + 30
  let f = `<line x1="${SIDE}" y1="${fLineY}" x2="${width - SIDE}" y2="${fLineY}" stroke="${content.border}" stroke-width="1"/>`
  const sw = (x: number, color: string, label: string): string =>
    `<rect x="${x}" y="${fy - 9}" width="11" height="11" rx="2" fill="${color}"/>` +
    `<text x="${x + 16}" y="${fy}" font-size="12" fill="${content.muted}">${esc(label)}</text>`
  const step = (label: string): number => 30 + label.length * 6.4
  let lx = SIDE
  f += sw(lx, PRINT.male, content.legend.male)
  lx += step(content.legend.male)
  f += sw(lx, PRINT.female, content.legend.female)
  lx += step(content.legend.female)
  f += sw(lx, PRINT.unknown, content.legend.unknown)
  lx += step(content.legend.unknown)
  f +=
    `<rect x="${lx}" y="${fy - 9}" width="11" height="11" rx="2" fill="${PRINT.badgeBg}"/>` +
    `<text x="${lx + 16}" y="${fy}" font-size="12" fill="${content.muted}">${esc(content.legend.docs)}</text>`
  if (content.footerRight) {
    f += `<text x="${width - SIDE}" y="${fy}" text-anchor="end" font-size="12" fill="${content.muted}">${esc(content.footerRight)}</text>`
  }
  pieces.push({ x: 0, y: fLineY - 2, w: width, h: footerH, svg: f })

  return { defs: tree.defs, width, height, pieces }
}

export { FONT }
