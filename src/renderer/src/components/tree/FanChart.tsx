import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { arc as d3arc } from 'd3-shape'
import type { TreeNodeDatum } from '@shared/types'
import type { FanColorMode, FanSweep } from '@/store/usePedigreeSettings'
import { formatName } from '@/lib/utils'

interface Hover {
  label: string
  sub: string
  mx: number
  my: number
}

const DEG = Math.PI / 180
const R0 = 60 // central disc radius
const RING = 78 // generation ring thickness

interface Wedge {
  id: string
  datum: TreeNodeDatum
  gen: number
  a0: number
  a1: number
}

/** d3 angle convention: 0 = 12 o'clock, increasing clockwise. */
function pointAt(r: number, a: number): [number, number] {
  return [r * Math.sin(a), -r * Math.cos(a)]
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// Gentle lightening toward the rim so deep generations recede.
function alphaFor(gen: number): number {
  return Math.max(0.1, 0.46 - gen * 0.04)
}

const GEN_HUES = [212, 250, 286, 330, 8, 40, 158, 186]

function fillFor(
  datum: TreeNodeDatum,
  gen: number,
  mode: FanColorMode,
  accent: [number, number, number]
): string {
  const a = alphaFor(gen)
  if (mode === 'generation') {
    const h = GEN_HUES[(gen - 1) % GEN_HUES.length]
    return `hsl(${h} 64% 56% / ${a})`
  }
  if (mode === 'mono') return `rgba(${accent[0]},${accent[1]},${accent[2]},${a})`
  const rgb =
    datum.sex === 'F' ? [236, 72, 153] : datum.sex === 'M' ? [56, 132, 243] : [148, 163, 184]
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`
}

/** Split a node into [given, surname] for two-line labels. */
function nameParts(d: TreeNodeDatum): [string, string] {
  const g = (d.given ?? '').trim()
  const s = (d.surname ?? '').trim()
  if (g || s) return [g, s]
  const toks = (d.name ?? '').trim().split(/\s+/).filter(Boolean)
  if (toks.length <= 1) return [d.name ?? '', '']
  return [toks.slice(0, -1).join(' '), toks[toks.length - 1]]
}

function arcPath(r: number, a0: number, a1: number, flip: boolean): string {
  const [x0, y0] = pointAt(r, a0)
  const [x1, y1] = pointAt(r, a1)
  const large = a1 - a0 > Math.PI ? 1 : 0
  return flip
    ? `M ${x1},${y1} A ${r},${r} 0 ${large} 0 ${x0},${y0}`
    : `M ${x0},${y0} A ${r},${r} 0 ${large} 1 ${x1},${y1}`
}

interface Line {
  r: number
  text: string
  fs: number
  muted?: boolean
}
interface Plan {
  w: Wedge
  flip: boolean
  lines: Line[]
}

interface SvgProps {
  data: TreeNodeDatum
  generations: number
  sweep: FanSweep
  colorMode: FanColorMode
  showYears: boolean
  accent: string
  onSelect: (personId: string) => void
  onEnter: (h: Hover) => void
  onLeave: () => void
}

/**
 * The whole fan is drawn here and memoised on its inputs ONLY — never on hover.
 * Hover highlighting is pure CSS (`:hover`), and the tooltip lives in the parent,
 * so moving the mouse over a 6-generation fan re-renders nothing here.
 */
const FanSvg = memo(function FanSvg({
  data,
  generations,
  sweep,
  colorMode,
  showYears,
  accent,
  onSelect,
  onEnter,
  onLeave
}: SvgProps): JSX.Element {
  const downAt = useRef<{ x: number; y: number } | null>(null)
  const pick = (personId: string | undefined, e: { clientX: number; clientY: number }): void => {
    const d = downAt.current
    if (!personId) return
    if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return
    onSelect(personId)
  }

  const accentRgb = useMemo<[number, number, number]>(
    () => hexToRgb(accent) ?? [99, 102, 241],
    [accent]
  )

  const span = sweep * DEG
  const a0Root = -span / 2

  const wedges = useMemo(() => {
    const out: Wedge[] = []
    let counter = 0
    const walk = (node: TreeNodeDatum, gen: number, a0: number, a1: number): void => {
      if (gen > 0) out.push({ id: `fan-${counter++}`, datum: node, gen, a0, a1 })
      if (gen >= generations) return
      const kids = node.children ?? []
      const mid = (a0 + a1) / 2
      if (kids[0]) walk(kids[0], gen + 1, a0, mid)
      if (kids[1]) walk(kids[1], gen + 1, mid, a1)
    }
    walk(data, 0, a0Root, a0Root + span)
    return out
  }, [data, generations, span, a0Root])

  const plans = useMemo<Plan[]>(() => {
    return wedges.map((w) => {
      const inner = R0 + (w.gen - 1) * RING
      const outer = R0 + w.gen * RING
      const midR = (inner + outer) / 2
      const mid = (w.a0 + w.a1) / 2
      const dA = w.a1 - w.a0
      const flip = Math.cos(mid) < 0
      const fit = (r: number, len: number, base: number): number =>
        Math.max(6, Math.min(base, (r * dA - 6) / (Math.max(1, len) * 0.6)))

      const [given, surname] = nameParts(w.datum)
      const full = formatName(w.datum.given, w.datum.surname) || w.datum.name
      const years = [w.datum.birthYear, w.datum.deathYear].filter(Boolean).join('–')

      if (w.gen <= 2) {
        const base = w.gen === 1 ? 13 : 12
        const fs = fit(midR, full.length, base)
        const lines: Line[] = [{ r: midR + (showYears && years ? 7 : 0), text: full, fs }]
        if (showYears && years)
          lines.push({ r: midR + 7 - fs - 2, text: years, fs: fs - 2.5, muted: true })
        return { w, flip, lines }
      }

      const base = w.gen === 3 ? 11 : w.gen === 4 ? 10 : w.gen <= 6 ? 9 : 8
      if (!surname) {
        const fs = fit(midR, given.length, base)
        return { w, flip, lines: [{ r: midR, text: given, fs }] }
      }
      const fs = Math.min(fit(midR, given.length, base), fit(midR, surname.length, base))
      const gap = fs * 0.62
      return {
        w,
        flip,
        lines: [
          { r: midR + gap, text: given, fs },
          { r: midR - gap, text: surname, fs }
        ]
      }
    })
  }, [wedges, showYears])

  const maxR = R0 + generations * RING
  const view = useMemo(() => {
    let minX = -R0,
      maxX = R0,
      minY = -R0,
      maxY = R0
    const rim = maxR + 4
    for (let i = 0; i <= 64; i++) {
      const a = a0Root + (span * i) / 64
      for (const r of [R0, rim]) {
        const [x, y] = pointAt(r, a)
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
    const pad = 22
    return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 }
  }, [span, a0Root, maxR])

  const arcGen = useMemo(
    () =>
      d3arc<{ inner: number; outer: number; a0: number; a1: number }>()
        .innerRadius((d) => d.inner)
        .outerRadius((d) => d.outer)
        .startAngle((d) => d.a0)
        .endAngle((d) => d.a1)
        .padAngle(0.004)
        .cornerRadius(3),
    []
  )

  const rootName = formatName(data.given, data.surname) || data.name
  const rootYears = [data.birthYear, data.deathYear].filter(Boolean).join('–')

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      className="select-none"
      onMouseDown={(e) => (downAt.current = { x: e.clientX, y: e.clientY })}
    >
      {/* Hover highlight is pure CSS on the single hovered wedge — no React
          re-render, and only one element repaints. */}
      <style>{`
        .fan-wedges > path { transition: filter .12s; }
        .fan-wedges > path:hover { filter: brightness(1.12); }
      `}</style>

      <defs>
        {plans.map((p) =>
          p.lines.map((ln, i) => (
            <path
              key={`${p.w.id}-b${i}`}
              id={`${p.w.id}-b${i}`}
              d={arcPath(ln.r, p.w.a0, p.w.a1, p.flip)}
              fill="none"
            />
          ))
        )}
      </defs>

      <g className="fan-wedges">
        {wedges.map((w) => {
          const inner = R0 + (w.gen - 1) * RING
          const outer = R0 + w.gen * RING
          const d = arcGen({ inner, outer, a0: w.a0, a1: w.a1 }) ?? ''
          return (
            <path
              key={`f-${w.id}`}
              d={d}
              fill={fillFor(w.datum, w.gen, colorMode, accentRgb)}
              stroke="hsl(var(--background))"
              strokeWidth={0.75}
              className="cursor-pointer"
              onClick={(e) => pick(w.datum.personId, e)}
              onMouseEnter={(e) =>
                onEnter({
                  label: formatName(w.datum.given, w.datum.surname) || w.datum.name,
                  sub: [w.datum.birthYear, w.datum.deathYear].filter(Boolean).join('–'),
                  mx: e.clientX,
                  my: e.clientY
                })
              }
              onMouseLeave={onLeave}
            />
          )
        })}
      </g>

      {/* Curved labels — pointer-events off so they never interrupt wedge hover. */}
      <g className="pointer-events-none">
        {plans.map((p) => (
          <g key={`t-${p.w.id}`}>
            {p.lines.map((ln, i) => (
              <text
                key={i}
                fontSize={ln.fs}
                fontWeight={p.w.gen <= 1 ? 600 : 500}
                className={ln.muted ? 'fill-muted-foreground' : 'fill-foreground'}
              >
                <textPath href={`#${p.w.id}-b${i}`} startOffset="50%" textAnchor="middle">
                  {ln.text}
                </textPath>
              </text>
            ))}
          </g>
        ))}
      </g>

      {/* Central root disc */}
      <circle
        r={R0}
        className="cursor-pointer fill-card"
        stroke="hsl(var(--primary))"
        strokeWidth={2}
        onClick={(e) => pick(data.personId, e)}
      />
      <circle
        r={R0 - 5}
        fill="none"
        className="pointer-events-none"
        stroke="hsl(var(--primary) / 0.25)"
        strokeWidth={1}
      />
      <text textAnchor="middle" className="pointer-events-none fill-foreground" fontWeight={600}>
        <tspan x={0} dy="-0.2em" fontSize={13}>
          {rootName.length > 16 ? rootName.slice(0, 15) + '…' : rootName}
        </tspan>
        {rootYears && (
          <tspan x={0} dy="1.5em" fontSize={10} className="fill-muted-foreground">
            {rootYears}
          </tspan>
        )}
      </text>
    </svg>
  )
})

function FanChartImpl({
  data,
  generations,
  sweep = 360,
  colorMode = 'sex',
  showYears = true,
  accent = 'hsl(var(--primary))',
  onSelect
}: {
  data: TreeNodeDatum
  generations: number
  sweep?: FanSweep
  colorMode?: FanColorMode
  showYears?: boolean
  accent?: string
  onSelect: (personId: string) => void
}): JSX.Element {
  const [hover, setHover] = useState<Hover | null>(null)
  const onEnter = useCallback((h: Hover) => setHover(h), [])
  const onLeave = useCallback(() => setHover(null), [])

  return (
    <div
      className="relative h-full w-full"
      // Follow the cursor while hovering a wedge. This only re-renders the tooltip
      // (FanSvg is memoised), so the chart itself never re-renders on mouse move.
      onMouseMove={(e) => {
        const mx = e.clientX
        const my = e.clientY
        setHover((h) => (h ? { ...h, mx, my } : h))
      }}
    >
      <FanSvg
        data={data}
        generations={generations}
        sweep={sweep}
        colorMode={colorMode}
        showYears={showYears}
        accent={accent}
        onSelect={onSelect}
        onEnter={onEnter}
        onLeave={onLeave}
      />

      {hover &&
        createPortal(
          // Portalled to <body> so it escapes PanZoom's CSS transform — otherwise
          // `position: fixed` would resolve against the scaled/translated canvas
          // and the tooltip would land far from the cursor.
          <div
            className="pointer-events-none fixed z-[100] rounded-md border border-border bg-popover px-2.5 py-1.5 text-popover-foreground shadow-xl"
            style={{ left: hover.mx + 12, top: hover.my + 12 }}
          >
            <p className="text-xs font-semibold">{hover.label}</p>
            {hover.sub && <p className="text-[11px] text-muted-foreground">{hover.sub}</p>}
          </div>,
          document.body
        )}
    </div>
  )
}

export const FanChart = memo(FanChartImpl)
