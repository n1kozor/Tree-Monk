// Full-expand pedigree layout + SVG. Mirrors the on-screen PedigreeChart maths
// (same card size, spacing and elbow connectors) but, unlike the interactive
// view, expands EVERY branch up to the requested generation limits so the whole
// tree lands on the printed sheet.
import type { PedigreeCouple, PedigreePerson } from '@shared/types'
import { formatName } from '@/lib/utils'
import {
  AVATAR_CLIP_DEF,
  PRINT,
  avatarSvg,
  docBadge,
  esc,
  fitChars,
  truncate,
  type ExportContent,
  type Piece,
  type TreeSvg
} from './svgKit'

const CARD_W = 252
const CARD_H = 128
const PAD = 40

export interface PedigreeLayoutOpts {
  colGap: number
  rowGap: number
  /** Ancestor generations to draw (root = 0). */
  ancGenerations: number
  /** Descendant generations to draw below the root (0 = none). */
  descGenerations: number
}

interface Box {
  couple: PedigreeCouple
  gen: number
  x: number
  y: number
  kind: 'anc' | 'desc'
}

interface Link {
  d: string
  x: number
  y: number
  w: number
  h: number
}

function elbow(x1: number, y1: number, x2: number, y2: number): Link {
  const d =
    Math.abs(y1 - y2) < 1
      ? `M ${x1} ${y1} H ${x2}`
      : (() => {
          const midX = (x1 + x2) / 2
          const r = Math.min(14, Math.abs(y2 - y1) / 2)
          const dir = y2 > y1 ? 1 : -1
          return `M ${x1} ${y1} H ${midX - r} Q ${midX} ${y1} ${midX} ${y1 + r * dir} V ${y2 - r * dir} Q ${midX} ${y2} ${midX + r} ${y2} H ${x2}`
        })()
  const pad = 2
  const minx = Math.min(x1, x2) - pad
  const miny = Math.min(y1, y2) - pad
  return { d, x: minx, y: miny, w: Math.abs(x2 - x1) + pad * 2, h: Math.abs(y2 - y1) + pad * 2 }
}

function layout(
  root: PedigreeCouple,
  opts: PedigreeLayoutOpts
): { boxes: Box[]; links: Link[]; width: number; height: number } {
  const colW = opts.colGap
  const leaf = opts.rowGap

  // ---- Ancestors expand rightward (root at gen 0). ----
  const ancBoxes: Box[] = []
  let ancLeaf = 0
  const placeAnc = (couple: PedigreeCouple, gen: number): number => {
    const x = gen * colW
    const open = gen < opts.ancGenerations
    const fp = open ? couple.fatherParents : null
    const mp = open ? couple.motherParents : null
    let y: number
    if (!fp && !mp) {
      y = ancLeaf * leaf
      ancLeaf++
    } else if (fp && mp) {
      const yF = placeAnc(fp, gen + 1)
      const yM = placeAnc(mp, gen + 1)
      y = (yF + yM) / 2
    } else {
      y = placeAnc((fp ?? mp)!, gen + 1)
    }
    ancBoxes.push({ couple, gen, x, y, kind: 'anc' })
    return y
  }
  const rootY = placeAnc(root, 0)

  // ---- Descendants expand leftward. ----
  const descBoxes: Box[] = []
  let descLeaf = 0
  const placeDesc = (couple: PedigreeCouple, depth: number): number => {
    const x = -depth * colW
    const kids = depth < opts.descGenerations ? couple.descendants : []
    let y: number
    if (!kids.length) {
      y = descLeaf * leaf
      descLeaf++
    } else {
      const ys = kids.map((k) => placeDesc(k, depth + 1))
      y = (Math.min(...ys) + Math.max(...ys)) / 2
    }
    descBoxes.push({ couple, gen: -depth, x, y, kind: 'desc' })
    return y
  }
  if (opts.descGenerations > 0) for (const d of root.descendants) placeDesc(d, 1)

  if (descBoxes.length) {
    const dys = descBoxes.map((b) => b.y)
    const shift = rootY - (Math.min(...dys) + Math.max(...dys)) / 2
    descBoxes.forEach((b) => (b.y += shift))
  }

  const all = [...ancBoxes, ...descBoxes]
  const xs = all.map((b) => b.x)
  const ys = all.map((b) => b.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const offsetX = -minX + PAD
  const offsetY = -minY + PAD
  all.forEach((b) => {
    b.x += offsetX
    b.y += offsetY + CARD_H / 2
  })

  const byCouple = new Map<PedigreeCouple, Box>(all.map((b) => [b.couple, b]))
  const links: Link[] = []

  for (const b of ancBoxes) {
    if (b.gen >= opts.ancGenerations) continue
    const childRight = b.x + CARD_W
    const fp = b.couple.fatherParents && byCouple.get(b.couple.fatherParents)
    const mp = b.couple.motherParents && byCouple.get(b.couple.motherParents)
    if (fp) links.push(elbow(childRight, b.y - 28, fp.x, fp.y))
    if (mp) links.push(elbow(childRight, b.y + 28, mp.x, mp.y))
  }

  const rootBox = byCouple.get(root)
  const descSources = rootBox ? [rootBox, ...descBoxes] : descBoxes
  for (const b of descSources) {
    const depth = b.kind === 'desc' ? -b.gen : 0
    if (depth >= opts.descGenerations) continue
    for (const child of b.couple.descendants) {
      const cb = byCouple.get(child)
      if (cb) links.push(elbow(b.x, b.y, cb.x + CARD_W, cb.y))
    }
  }

  return {
    boxes: all,
    links,
    width: maxX - minX + CARD_W + PAD * 2,
    height: maxY - minY + PAD * 2 + CARD_H
  }
}

function span(p: PedigreePerson, content: ExportContent): string {
  if (content.hideLiving && p.living) return ''
  if (!content.dates) return ''
  if (p.birthYear && p.deathYear) return `${p.birthYear}–${p.deathYear}`
  if (p.birthYear) return `${p.birthYear}–${p.living ? content.livingLabel : content.deceasedLabel}`
  if (p.deathYear) return `–${p.deathYear}`
  return p.living ? content.livingLabel : content.deceasedLabel
}

function personName(p: PedigreePerson, content: ExportContent): string {
  if (content.hideLiving && p.living) return content.livingLabel
  return formatName(p.given, p.surname) || p.name
}

/** One person row of a couple card, drawn at local (0, y0). */
function personRow(p: PedigreePerson | null, y0: number, content: ExportContent): string {
  const cy = y0 + 21
  if (!p) {
    return (
      `<circle cx="26" cy="${cy}" r="16" fill="none" stroke="${PRINT.border}" ` +
      `stroke-dasharray="3 3"/>` +
      `<text x="50" y="${cy + 4}" font-size="13" fill="${PRINT.muted}">—</text>`
    )
  }
  const name = personName(p, content)
  const hasDocs = content.docs && p.docs > 0
  const nameW = CARD_W - 50 - 12 - (hasDocs ? 34 : 0)
  const out: string[] = []
  out.push(avatarSvg(26, cy, 16, name, p.sex, p.id, content))
  out.push(
    `<text x="50" y="${y0 + 18}" font-size="13" font-weight="600" fill="${PRINT.ink}">` +
      `${esc(truncate(name, fitChars(nameW, 13)))}</text>`
  )
  const s = span(p, content)
  if (s) {
    out.push(
      `<text x="50" y="${y0 + 34}" font-size="11" fill="${PRINT.muted}">${esc(s)}</text>`
    )
  }
  if (hasDocs) out.push(docBadge(p.docs, CARD_W - 12, y0 + 6))
  return out.join('')
}

/** A two-person couple card with marriage strip + optional children footer. */
function coupleCard(box: Box, isRoot: boolean, content: ExportContent): string {
  const { couple } = box
  const x = box.x
  const y = box.y - CARD_H / 2
  const out: string[] = []
  out.push(`<g transform="translate(${x},${y})">`)
  out.push(
    `<rect x="0" y="0" width="${CARD_W}" height="${CARD_H}" rx="12" fill="${PRINT.card}" ` +
      `stroke="${isRoot ? content.accent : PRINT.border}" stroke-width="${isRoot ? 2 : 1}"/>`
  )
  out.push(personRow(couple.primary, 0, content))

  // Marriage strip (two little rings + optional date/place).
  out.push(`<rect x="1" y="42" width="${CARD_W - 2}" height="18" fill="${PRINT.faint}"/>`)
  out.push(
    `<circle cx="13" cy="51" r="3.2" fill="none" stroke="${PRINT.muted}" stroke-width="1"/>` +
      `<circle cx="18" cy="51" r="3.2" fill="none" stroke="${PRINT.muted}" stroke-width="1"/>`
  )
  const mTxt = [content.dates ? couple.marriageDate : '', content.places ? couple.marriagePlace : '']
    .filter(Boolean)
    .join(' · ')
  if (mTxt) {
    out.push(
      `<text x="26" y="55" font-size="10" fill="${PRINT.muted}">` +
        `${esc(truncate(mTxt, fitChars(CARD_W - 36, 10)))}</text>`
    )
  }

  out.push(personRow(couple.partner, 60, content))

  if (couple.children.length > 0) {
    out.push(`<line x1="1" y1="102" x2="${CARD_W - 1}" y2="102" stroke="${PRINT.border}"/>`)
    out.push(
      `<text x="12" y="119" font-size="11" font-weight="600" fill="${PRINT.muted}">` +
        `${esc(content.childrenLabel)} (${couple.children.length})</text>`
    )
  }

  out.push(`</g>`)
  return out.join('')
}

/** Builds the pedigree sub-tree as positioned pieces (no poster chrome). */
export function buildPedigreeTreeSvg(
  root: PedigreeCouple,
  opts: PedigreeLayoutOpts,
  content: ExportContent
): TreeSvg {
  const { boxes, links, width, height } = layout(root, opts)
  const pieces: Piece[] = []
  // Connectors first so cards paint on top within any shared tile.
  for (const l of links) {
    pieces.push({
      x: l.x,
      y: l.y,
      w: l.w,
      h: l.h,
      svg: `<path d="${l.d}" fill="none" stroke="${content.accent}" stroke-opacity="0.6" stroke-width="2"/>`
    })
  }
  for (const b of boxes) {
    pieces.push({
      x: b.x,
      y: b.y - CARD_H / 2,
      w: CARD_W,
      h: CARD_H,
      svg: coupleCard(b, b.couple.id === root.id, content)
    })
  }
  return { defs: AVATAR_CLIP_DEF, width, height, pieces }
}
