import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react'

interface T {
  x: number
  y: number
  scale: number
}

/** Render detail level derived from the current zoom. `lite` drops the heaviest
 *  bits (portrait images) so a fully-expanded, zoomed-out tree stays smooth. */
export type TreeLod = 'full' | 'lite'
const TreeLodContext = createContext<TreeLod>('full')
/** Read the current level-of-detail from inside the pan/zoom canvas. */
export const useTreeLod = (): TreeLod => useContext(TreeLodContext)

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/**
 * Wheel-zoom (centred on the cursor) + drag-pan container.
 * When `fitKey` changes (and content dimensions are given) the camera smoothly
 * re-fits the whole content into view — used so the pedigree re-frames itself
 * on expand / collapse / new root.
 */
export function PanZoom({
  children,
  fitKey,
  contentWidth,
  contentHeight,
  focusKey,
  focusX,
  focusY
}: {
  children: ReactNode
  fitKey?: string | number
  contentWidth?: number
  contentHeight?: number
  /** Pan (keeping the current zoom) so this content point centres — used to
   *  follow the just-expanded branch. */
  focusKey?: string | number
  focusX?: number
  focusY?: number
}): JSX.Element {
  const [t, setT] = useState<T>({ x: 0, y: 0, scale: 1 })
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // True during active wheel scrolling so the transform updates instantly (no
  // easing lag); cleared shortly after so fit/focus reframes still animate.
  const [wheeling, setWheeling] = useState(false)
  const wheelTimer = useRef<ReturnType<typeof setTimeout>>()
  // The fitKey we last successfully framed. Lets a plain resize keep the user's
  // pan/zoom, while a never-fitted content (mounted at 0×0) still gets framed
  // as soon as a real size arrives.
  const fittedRef = useRef<string | number | undefined>(undefined)
  const [size, setSize] = useState({ w: 0, h: 0 })
  // Baseline the resize-compensation measures deltas against. Synced after every
  // fit so a fresh frame is never undone by a stale size delta.
  const prevSize = useRef({ w: 0, h: 0 })

  // Switching views can mount this container at 0×0; the fit effect then bails
  // and the tree sits un-framed ("scattered") until the next change. A
  // ResizeObserver re-runs the fit the moment the container gets a real size.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (r) setSize({ w: Math.round(r.width), h: Math.round(r.height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Bucket the zoom into a coarse detail level (with hysteresis so it doesn't
  // flicker right at the boundary). Stored separately so panning/zooming — which
  // updates `t` every frame — only re-renders the cards when the bucket flips.
  const [lod, setLod] = useState<TreeLod>('full')
  useEffect(() => {
    setLod((prev) => {
      if (prev === 'full' && t.scale < 0.5) return 'lite'
      if (prev === 'lite' && t.scale > 0.62) return 'full'
      return prev
    })
  }, [t.scale])

  // Fit the whole content (new tree / bulk expand-collapse). Also re-runs when the
  // container size changes — but only frames content it hasn't framed yet, so a
  // plain resize keeps the current pan/zoom.
  useEffect(() => {
    if (fitKey === undefined || !contentWidth || !contentHeight) return
    if (fittedRef.current === fitKey) return
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (!rect.width || !rect.height) return // not laid out yet — ResizeObserver will re-run this
    const pad = 60
    const scale = clamp(
      Math.min((rect.width - pad) / contentWidth, (rect.height - pad) / contentHeight),
      0.25,
      1.1
    )
    setT({
      x: (rect.width - contentWidth * scale) / 2,
      y: (rect.height - contentHeight * scale) / 2,
      scale
    })
    fittedRef.current = fitKey
    // The frame is authoritative — re-baseline the resize delta so the camera
    // can't be nudged off this fresh fit.
    prevSize.current = { w: rect.width, h: rect.height }
  }, [fitKey, contentWidth, contentHeight, size])

  // When the container itself resizes (the tab strip appearing/disappearing, the
  // sidebar collapsing, a window resize) the already-fitted camera would go stale
  // and the tree/links look "scattered". Shift the camera by half the size delta
  // so the content point at the viewport centre stays put — no jump, zoom kept.
  useEffect(() => {
    const { w, h } = size
    const { w: pw, h: ph } = prevSize.current
    if (w && h) prevSize.current = { w, h }
    if (!pw || !ph || !w || !h) return // first real size → the fit effect frames it
    setT((prev) => ({ ...prev, x: prev.x + (w - pw) / 2, y: prev.y + (h - ph) / 2 }))
  }, [size])

  // Follow a single expand/collapse — pan to the toggled node at current zoom.
  useEffect(() => {
    if (focusKey === undefined || focusX === undefined || focusY === undefined) return
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setT((prev) => ({ ...prev, x: rect.width / 2 - focusX * prev.scale, y: rect.height / 2 - focusY * prev.scale }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey])

  // Drop the wheel-idle timer on unmount.
  useEffect(() => () => clearTimeout(wheelTimer.current), [])

  // Briefly flag active wheel scrolling so the transform follows the wheel without
  // the easing lag (re-enabled right after so camera reframes still animate).
  const markWheeling = (): void => {
    setWheeling(true)
    if (wheelTimer.current) clearTimeout(wheelTimer.current)
    wheelTimer.current = setTimeout(() => setWheeling(false), 160)
  }

  return (
    <div
      ref={containerRef}
      className="h-full w-full cursor-grab overflow-hidden active:cursor-grabbing"
      onWheel={(e) => {
        // Wheel = zoom, centred on the cursor. (Pan by dragging, or Shift+wheel.)
        markWheeling()
        const rect = e.currentTarget.getBoundingClientRect()
        if (e.shiftKey && e.deltaX === 0) {
          // Shift+wheel → horizontal pan (handy for wide pedigrees).
          setT((prev) => ({ ...prev, x: prev.x - e.deltaY }))
          return
        }
        const px = e.clientX - rect.left
        const py = e.clientY - rect.top
        setT((prev) => {
          const factor = Math.exp(-e.deltaY * 0.0012)
          const scale = clamp(prev.scale * factor, 0.1, 4)
          const k = scale / prev.scale
          // Keep the point under the cursor fixed while scaling.
          return { scale, x: px - (px - prev.x) * k, y: py - (py - prev.y) * k }
        })
      }}
      onPointerDown={(e) => {
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        drag.current = { x: e.clientX, y: e.clientY, ox: t.x, oy: t.y }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        const dx = e.clientX - d.x
        const dy = e.clientY - d.y
        setT((prev) => ({ ...prev, x: d.ox + dx, y: d.oy + dy }))
      }}
      onPointerUp={() => (drag.current = null)}
      onDoubleClick={(e) => {
        // Jump to the cursor: pan so the point under it lands in the viewport
        // centre (the current zoom is kept). Empty canvas → recentres there.
        const rect = e.currentTarget.getBoundingClientRect()
        const px = e.clientX - rect.left
        const py = e.clientY - rect.top
        setT((prev) => ({ ...prev, x: prev.x + (rect.width / 2 - px), y: prev.y + (rect.height / 2 - py) }))
      }}
    >
      <div
        className="h-full w-full"
        style={{
          transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})`,
          transformOrigin: '0 0',
          transition: drag.current || wheeling ? 'none' : 'transform 0.25s ease-out'
        }}
      >
        <TreeLodContext.Provider value={lod}>{children}</TreeLodContext.Provider>
      </div>
    </div>
  )
}
