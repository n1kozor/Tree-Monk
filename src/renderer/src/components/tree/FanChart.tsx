import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { TreeNodeDatum } from '@shared/types'
import type { FanColorMode, FanSweep } from '@/store/usePedigreeSettings'
import { formatName } from '@/lib/utils'

/**
 * Fan (circle) ancestor chart — Canvas 2D renderer with its own infinite camera.
 *
 * Rewritten from the ground up (previously SVG + textPath, which re-rasterised
 * hundreds of curved labels on every pan/zoom frame and went blurry under a
 * cached GPU layer). The canvas redraws at device-pixel resolution every frame,
 * so it is pixel-crisp at ANY zoom, and it does its own work-avoidance:
 *
 *  - Viewport culling: only wedges intersecting the screen are drawn.
 *  - Semantic zoom: labels appear per-wedge exactly when they fit legibly —
 *    zoom into generation 12 and the names fade in, always readable.
 *  - Batched deep rings: when wedges are sub-pixel they are merged into a few
 *    fill paths per generation instead of thousands of individual sectors.
 *  - Radial labels: every name lies along its wedge's spoke, pointing at the
 *    centre (flipped on the western half so nothing reads upside-down).
 *  - Ghost slots: missing ancestors show as faint dashed wedges — research
 *    gaps are visible at a glance.
 */

const DEG = Math.PI / 180
const R0 = 70 // central disc radius (chart units)
const RING = 92 // generation ring thickness
const RING_PAD = 4 // radial gap between rings
const FONT = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"

interface Hover {
  label: string
  sub: string
  mx: number
  my: number
}

interface Wedge {
  datum: TreeNodeDatum | null // null → ghost slot (unknown ancestor)
  gen: number
  a0: number
  a1: number
  given: string
  surname: string
  full: string
  years: string
}

/** Chart convention: angle 0 = 12 o'clock, increasing clockwise. */
function pointAt(r: number, a: number): [number, number] {
  return [r * Math.sin(a), -r * Math.cos(a)]
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Gentle fade toward the rim so deep generations recede. */
function alphaFor(gen: number): number {
  return Math.max(0.16, 0.5 - gen * 0.026)
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

/** Split a node into [given, surname] for stacked labels. */
function nameParts(d: TreeNodeDatum): [string, string] {
  const g = (d.given ?? '').trim()
  const s = (d.surname ?? '').trim()
  if (g || s) return [g, s]
  const toks = (d.name ?? '').trim().split(/\s+/).filter(Boolean)
  if (toks.length <= 1) return [d.name ?? '', '']
  return [toks.slice(0, -1).join(' '), toks[toks.length - 1]]
}

/** Annular sector path (angles in chart convention). */
function sectorPath(
  p: CanvasRenderingContext2D | Path2D,
  r0: number,
  r1: number,
  a0: number,
  a1: number
): void {
  // Canvas arcs use math angles (0 = +x); chart angle a maps to t = a - π/2.
  const t0 = a0 - Math.PI / 2
  const t1 = a1 - Math.PI / 2
  if (p instanceof Path2D) {
    p.moveTo(r1 * Math.cos(t0), r1 * Math.sin(t0))
    p.arc(0, 0, r1, t0, t1)
    p.lineTo(r0 * Math.cos(t1), r0 * Math.sin(t1))
    p.arc(0, 0, r0, t1, t0, true)
    p.closePath()
  } else {
    p.beginPath()
    p.arc(0, 0, r1, t0, t1)
    p.arc(0, 0, r0, t1, t0, true)
    p.closePath()
  }
}

interface Cam {
  x: number
  y: number
  s: number
}

function FanChartImpl({
  data,
  generations,
  sweep = 360,
  colorMode = 'sex',
  showYears = true,
  accent = '#16c2ad',
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
  // Re-renders on language switch; Hungarian writes the family name first.
  const { i18n } = useTranslation()
  const huFirst = (i18n.language || '').toLowerCase().startsWith('hu')

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cam = useRef<Cam>({ x: 0, y: 0, s: 1 })
  const rafRef = useRef<number | undefined>(undefined)
  const drag = useRef<{ px: number; py: number; ox: number; oy: number; moved: boolean } | null>(
    null
  )
  const hoverRef = useRef<Wedge | null>(null)
  const fittedKey = useRef<string>('')
  const mcache = useRef<Map<string, number>>(new Map())
  // Batched deep-ring fill paths are camera-independent (chart units), so they
  // are built once per (model, colour-mode) and replayed every frame.
  const batchCache = useRef<Map<string, Map<string, Path2D>>>(new Map())
  const [hover, setHover] = useState<Hover | null>(null)

  const span = sweep * DEG
  const a0Root = -span / 2
  const maxR = R0 + generations * RING

  // ---- Model: wedges per generation (DFS keeps each ring sorted by angle) ----
  const byGen = useMemo(() => {
    const out: Wedge[][] = Array.from({ length: generations + 1 }, () => [])
    const push = (node: TreeNodeDatum | null, gen: number, a0: number, a1: number): void => {
      const [given, surname] = node ? nameParts(node) : ['', '']
      out[gen].push({
        datum: node,
        gen,
        a0,
        a1,
        given,
        surname,
        full: node ? formatName(node.given, node.surname) || node.name : '',
        years: node ? [node.birthYear, node.deathYear].filter(Boolean).join('–') : ''
      })
    }
    const walk = (node: TreeNodeDatum, gen: number, a0: number, a1: number): void => {
      if (gen > 0) push(node, gen, a0, a1)
      if (gen >= generations) return
      const kids = node.children ?? []
      const mid = (a0 + a1) / 2
      if (kids[0]) walk(kids[0], gen + 1, a0, mid)
      else push(null, gen + 1, a0, mid) // ghost father slot (not recursed)
      if (kids[1]) walk(kids[1], gen + 1, mid, a1)
      else push(null, gen + 1, mid, a1) // ghost mother slot
    }
    walk(data, 0, a0Root, a0Root + span)
    return out
    // huFirst: `full` is built via formatName, whose order follows the UI
    // language — rebuild the model when the language flips to/from Hungarian.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, generations, span, a0Root, huFirst])

  // ---- Content bounds (for fitting) ----
  const bounds = useMemo(() => {
    let minX = -R0
    let maxX = R0
    let minY = -R0
    let maxY = R0
    for (let i = 0; i <= 96; i++) {
      const a = a0Root + (span * i) / 96
      const [x, y] = pointAt(maxR, a)
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
  }, [span, a0Root, maxR])

  // ---- Draw (imperative; reads refs — stored in a ref so handlers stay stable) ----
  const drawRef = useRef<() => void>(() => undefined)
  drawRef.current = (): void => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const cw = wrap.clientWidth
    const ch = wrap.clientHeight
    if (!cw || !ch) return

    const { x: camX, y: camY, s } = cam.current
    const css = getComputedStyle(document.documentElement)
    const cvar = (n: string): string => css.getPropertyValue(n).trim()
    const primary = cvar('--primary')
    const fg = `hsl(${cvar('--foreground')})`
    const mutedFg = `hsl(${cvar('--muted-foreground')})`
    const card = `hsl(${cvar('--card')})`
    const accentRgb = hexToRgb(accent) ?? [22, 194, 173]

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cw, ch)
    ctx.translate(camX, camY)
    ctx.scale(s, s)

    // Visible chart-space rectangle (for culling).
    const vx0 = -camX / s
    const vy0 = -camY / s
    const vx1 = (cw - camX) / s
    const vy1 = (ch - camY) / s
    // Distance range from the view rect to the chart origin.
    const nx = Math.max(vx0, Math.min(0, vx1))
    const ny = Math.max(vy0, Math.min(0, vy1))
    const dMin = Math.hypot(nx, ny)
    const dMax = Math.max(
      Math.hypot(vx0, vy0),
      Math.hypot(vx1, vy0),
      Math.hypot(vx0, vy1),
      Math.hypot(vx1, vy1)
    )
    const boxVisible = (r1: number, a0: number, a1: number): boolean => {
      // Coarse bbox of the wedge's outer arc + spokes.
      let bx0 = Infinity
      let bx1 = -Infinity
      let by0 = Infinity
      let by1 = -Infinity
      const take = (x: number, y: number): void => {
        if (x < bx0) bx0 = x
        if (x > bx1) bx1 = x
        if (y < by0) by0 = y
        if (y > by1) by1 = y
      }
      const [xa, ya] = pointAt(r1, a0)
      const [xb, yb] = pointAt(r1, a1)
      take(xa, ya)
      take(xb, yb)
      take(0, 0)
      // Arc extremes at the cardinal chart angles inside [a0, a1].
      for (let k = Math.ceil(a0 / (Math.PI / 2)); k * (Math.PI / 2) <= a1; k++) {
        const [xe, ye] = pointAt(r1, k * (Math.PI / 2))
        take(xe, ye)
      }
      return bx1 >= vx0 && bx0 <= vx1 && by1 >= vy0 && by0 <= vy1
    }

    const hovered = hoverRef.current

    // ---- Rings ----
    for (let gen = 1; gen <= generations; gen++) {
      const rIn = R0 + (gen - 1) * RING + RING_PAD
      const rOut = R0 + gen * RING
      if (rIn > dMax || rOut < dMin) continue // ring fully off-screen
      const wedges = byGen[gen]
      if (!wedges || wedges.length === 0) continue
      const midR = (rIn + rOut) / 2
      const typSpan = span / Math.pow(2, gen)
      const typTp = s * midR * typSpan // typical tangential size on screen (px)

      if (typTp < 7) {
        // Deep, sub-legible ring → batch all wedges by fill colour into a few
        // paths (thousands of sectors become ~3 fills). Ghost slots stay empty.
        const cacheKey = `${gen}|${colorMode}|${accent}`
        let buckets = batchCache.current.get(cacheKey)
        if (!buckets) {
          buckets = new Map<string, Path2D>()
          for (const w of wedges) {
            if (!w.datum) continue
            const key = fillFor(w.datum, gen, colorMode, accentRgb)
            let p = buckets.get(key)
            if (!p) {
              p = new Path2D()
              buckets.set(key, p)
            }
            sectorPath(p, rIn, rOut, w.a0, w.a1)
          }
          batchCache.current.set(cacheKey, buckets)
        }
        for (const [color, path] of buckets) {
          ctx.fillStyle = color
          ctx.fill(path)
        }
        continue
      }

      // Hairline angular gap, constant on screen (~1.4 px).
      const gapA = Math.min(typSpan * 0.22, 1.4 / (s * rIn))

      for (const w of wedges) {
        if (!boxVisible(rOut, w.a0, w.a1)) continue
        const a0 = w.a0 + gapA / 2
        const a1 = w.a1 - gapA / 2
        if (a1 <= a0) continue
        const tp = s * midR * (w.a1 - w.a0)

        if (!w.datum) {
          // Ghost slot — faint dashed outline marking the research gap.
          if (tp < 16) continue
          sectorPath(ctx, rIn, rOut, a0, a1)
          ctx.fillStyle = 'rgba(128,128,128,0.05)'
          ctx.fill()
          ctx.setLineDash([5 / s, 5 / s])
          ctx.strokeStyle = 'rgba(128,128,128,0.28)'
          ctx.lineWidth = 1 / s
          ctx.stroke()
          ctx.setLineDash([])
          continue
        }

        sectorPath(ctx, rIn, rOut, a0, a1)
        ctx.fillStyle = fillFor(w.datum, gen, colorMode, accentRgb)
        ctx.fill()
        if (w === hovered) {
          ctx.strokeStyle = `hsl(${primary})`
          ctx.lineWidth = 2 / s
          ctx.stroke()
        }

        // ---- Radial label: lies along the spoke, pointing at the centre. ----
        // Shrink-to-fit: the font scales down until the FULL name fits the
        // radial box; below a legibility floor the text falls back to shorter
        // forms and finally hides (it reappears as you zoom in).
        if (tp < 10) continue
        const avail = RING - RING_PAD - 16
        const w12 = (t: string): number => {
          let v = mcache.current.get(t)
          if (v === undefined) {
            ctx.font = `12px ${FONT}`
            v = ctx.measureText(t).width
            mcache.current.set(t, v)
          }
          return v
        }
        // Screen font size at which `t` exactly fills the radial box.
        const fitS = (t: string): number => ((avail * 12) / Math.max(1, w12(t))) * s
        const capS = Math.min(12.5, Math.max(8, tp * 0.34)) // tangential cap (screen px)
        const MIN_S = 7.5 // legibility floor (screen px)

        const mid = (w.a0 + w.a1) / 2
        const flip = Math.sin(mid) < 0 // west half → rotate 180° so it reads upright
        const rot = mid - Math.PI / 2 + (flip ? Math.PI : 0)
        const [lx, ly] = pointAt(midR, mid)
        ctx.save()
        ctx.translate(lx, ly)
        ctx.rotate(rot)
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        const twoS = w.surname
          ? Math.min(capS, fitS(w.given || w.surname), fitS(w.surname))
          : 0
        if (tp >= 30 && twoS >= MIN_S) {
          // Line order follows the UI language (Hungarian: family name first);
          // the family name keeps the heavier weight in either order.
          const fs = twoS / s
          const line1 = huFirst ? w.surname : w.given
          const line2 = huFirst ? w.given : w.surname
          ctx.fillStyle = fg
          ctx.font = `${huFirst ? 600 : 500} ${fs}px ${FONT}`
          ctx.fillText(line1, 0, -0.66 * fs)
          ctx.font = `${huFirst ? 500 : 600} ${fs}px ${FONT}`
          ctx.fillText(line2, 0, 0.66 * fs)
          if (showYears && w.years && tp >= 48 && twoS >= 8.5) {
            ctx.font = `${fs * 0.8}px ${FONT}`
            ctx.fillStyle = mutedFg
            ctx.fillText(w.years, 0, 1.9 * fs)
          }
        } else {
          // Short form: "Given S." — Hungarian flips it to "Surname G.".
          const short = huFirst
            ? w.given
              ? `${w.surname} ${w.given[0]}.`
              : w.surname
            : w.surname
              ? `${w.given} ${w.surname[0]}.`
              : w.given
          const solo = huFirst ? w.surname || w.given : w.given || w.surname
          let text = ''
          let fsS = 0
          for (const c of [w.full, short, solo]) {
            if (!c) continue
            const f = Math.min(capS, fitS(c))
            if (f >= MIN_S) {
              text = c
              fsS = f
              break
            }
          }
          if (!text && (solo || w.full)) {
            // Nothing fits even shrunk — truncate at the floor size.
            fsS = MIN_S
            const fs = fsS / s
            let t = solo || w.full
            while (t.length > 2 && (w12(t + '…') * fs) / 12 > avail) t = t.slice(0, -1)
            text = t.length > 1 ? t + '…' : ''
          }
          if (text) {
            const fs = fsS / s
            ctx.fillStyle = fg
            ctx.font = `500 ${fs}px ${FONT}`
            ctx.fillText(text, 0, 0)
          }
        }
        ctx.restore()
      }
    }

    // ---- Generation numbers along the top spoke (only when rings are roomy) ----
    if (s * RING > 30) {
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `600 ${10 / s}px ${FONT}`
      ctx.fillStyle = mutedFg
      ctx.globalAlpha = 0.55
      for (let gen = 1; gen <= generations; gen++) {
        const r = R0 + (gen - 1) * RING + RING_PAD + 8 / s
        if (r > dMax || r < dMin) continue
        ctx.fillText(String(gen), 0, -r - 4 / s)
      }
      ctx.globalAlpha = 1
    }

    // ---- Central root disc ----
    if (dMin <= R0 + 24) {
      const halo = ctx.createRadialGradient(0, 0, R0, 0, 0, R0 + 22)
      halo.addColorStop(0, `hsl(${primary} / 0.3)`)
      halo.addColorStop(1, `hsl(${primary} / 0)`)
      ctx.beginPath()
      ctx.arc(0, 0, R0 + 22, 0, Math.PI * 2)
      ctx.fillStyle = halo
      ctx.fill()

      ctx.beginPath()
      ctx.arc(0, 0, R0, 0, Math.PI * 2)
      ctx.fillStyle = card
      ctx.fill()
      ctx.strokeStyle = `hsl(${primary})`
      ctx.lineWidth = Math.min(2.5, 2 / s)
      ctx.stroke()

      const rootName = formatName(data.given, data.surname) || data.name
      const rootYears = [data.birthYear, data.deathYear].filter(Boolean).join('–')
      ctx.font = `600 12px ${FONT}`
      const nameW = ctx.measureText(rootName).width
      const fsRoot = Math.min(14, ((R0 * 1.7) / Math.max(1, nameW)) * 12)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = fg
      ctx.font = `600 ${fsRoot}px ${FONT}`
      ctx.fillText(rootName, 0, rootYears ? -8 : 0)
      if (rootYears) {
        ctx.font = `${Math.max(9, fsRoot * 0.75)}px ${FONT}`
        ctx.fillStyle = mutedFg
        ctx.fillText(rootYears, 0, 10)
      }
    }
  }

  /** Redraw at most once per animation frame. */
  const scheduleDraw = useCallback((): void => {
    if (rafRef.current !== undefined) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = undefined
      drawRef.current()
    })
  }, [])

  /** Frame the whole fan with padding. */
  const fit = useCallback((): void => {
    const wrap = wrapRef.current
    if (!wrap) return
    const cw = wrap.clientWidth
    const ch = wrap.clientHeight
    if (!cw || !ch) return
    const pad = 48
    const s = Math.min(3, Math.max(0.02, Math.min((cw - pad * 2) / bounds.w, (ch - pad * 2) / bounds.h)))
    cam.current = {
      s,
      x: cw / 2 - (bounds.x + bounds.w / 2) * s,
      y: ch / 2 - (bounds.y + bounds.h / 2) * s
    }
    scheduleDraw()
  }, [bounds, scheduleDraw])

  // ---- Canvas sizing (device-pixel exact) + initial fit ----
  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const sync = (): void => {
      const dpr = window.devicePixelRatio || 1
      const w = Math.round(wrap.clientWidth * dpr)
      const h = Math.round(wrap.clientHeight * dpr)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      const key = `${data.personId ?? ''}|${generations}|${sweep}`
      if (fittedKey.current !== key && wrap.clientWidth > 0) {
        fittedKey.current = key
        fit()
      } else {
        scheduleDraw()
      }
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [data, generations, sweep, fit, scheduleDraw])

  // Settings / data changes → drop the cached batch paths and repaint.
  useEffect(() => {
    batchCache.current.clear()
    scheduleDraw()
  }, [byGen, colorMode, showYears, accent, scheduleDraw])

  // Theme switches (light/dark) repaint the canvas with the new palette.
  useEffect(() => {
    const mo = new MutationObserver(() => scheduleDraw())
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => mo.disconnect()
  }, [scheduleDraw])

  // Native wheel listener (non-passive so the page never scroll-bounces).
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const c = cam.current
      if (e.shiftKey && e.deltaX === 0) {
        c.x -= e.deltaY
        scheduleDraw()
        return
      }
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      const s2 = Math.min(60, Math.max(0.02, c.s * Math.exp(-e.deltaY * 0.0014)))
      const k = s2 / c.s
      cam.current = { s: s2, x: px - (px - c.x) * k, y: py - (py - c.y) * k }
      scheduleDraw()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [scheduleDraw])

  useEffect(
    () => () => {
      // Cancel AND clear the guard — a stale id left behind (e.g. StrictMode's
      // dev unmount/remount) would block every future scheduleDraw forever.
      if (rafRef.current !== undefined) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = undefined
      }
    },
    []
  )

  // ---- Hit-testing (analytic: radius → ring, binary search by angle) ----
  const hitTest = useCallback(
    (clientX: number, clientY: number): { wedge: Wedge | null; root: boolean } => {
      const wrap = wrapRef.current
      if (!wrap) return { wedge: null, root: false }
      const rect = wrap.getBoundingClientRect()
      const { x: camX, y: camY, s } = cam.current
      const x = (clientX - rect.left - camX) / s
      const y = (clientY - rect.top - camY) / s
      const r = Math.hypot(x, y)
      if (r <= R0) return { wedge: null, root: true }
      const gen = Math.floor((r - R0) / RING) + 1
      if (gen < 1 || gen > generations) return { wedge: null, root: false }
      const rIn = R0 + (gen - 1) * RING + RING_PAD
      if (r < rIn) return { wedge: null, root: false } // in the ring gap
      const a = Math.atan2(x, -y)
      if (a < a0Root || a > a0Root + span) return { wedge: null, root: false }
      const arr = byGen[gen]
      if (!arr || arr.length === 0) return { wedge: null, root: false }
      let lo = 0
      let hi = arr.length - 1
      while (lo < hi) {
        const m = (lo + hi + 1) >> 1
        if (arr[m].a0 <= a) lo = m
        else hi = m - 1
      }
      const w = arr[lo]
      return { wedge: w.a0 <= a && a <= w.a1 ? w : null, root: false }
    },
    [byGen, generations, a0Root, span]
  )

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing"
        onPointerDown={(e) => {
          ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
          drag.current = {
            px: e.clientX,
            py: e.clientY,
            ox: cam.current.x,
            oy: cam.current.y,
            moved: false
          }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (d) {
            const dx = e.clientX - d.px
            const dy = e.clientY - d.py
            if (Math.hypot(dx, dy) > 4) d.moved = true
            if (d.moved) {
              cam.current.x = d.ox + dx
              cam.current.y = d.oy + dy
              scheduleDraw()
            }
            return
          }
          // Hover: tooltip + single-wedge highlight (redraw only on change).
          const { wedge } = hitTest(e.clientX, e.clientY)
          const t = wedge?.datum ? wedge : null
          if (t !== hoverRef.current) {
            hoverRef.current = t
            scheduleDraw()
          }
          const canvas = canvasRef.current
          if (canvas) canvas.style.cursor = t ? 'pointer' : 'grab'
          if (t?.datum) {
            setHover({ label: t.full, sub: t.years, mx: e.clientX, my: e.clientY })
          } else {
            setHover((h) => (h ? null : h))
          }
        }}
        onPointerUp={(e) => {
          const d = drag.current
          drag.current = null
          if (d?.moved) return
          const { wedge, root } = hitTest(e.clientX, e.clientY)
          const id = root ? data.personId : wedge?.datum?.personId
          if (id) onSelect(id)
        }}
        onPointerLeave={() => {
          if (hoverRef.current) {
            hoverRef.current = null
            scheduleDraw()
          }
          setHover(null)
        }}
        onDoubleClick={fit}
      />

      {hover &&
        createPortal(
          <div
            className="glass-strong pointer-events-none fixed z-[100] rounded-xl px-2.5 py-1.5 text-card-foreground"
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
