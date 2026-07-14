import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Maximize2, ZoomIn, ZoomOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

/** A deep-zoom / pannable image viewer for high-resolution scans. */
export function ImageViewer({
  src,
  alt,
  onError
}: {
  src: string
  alt?: string
  /** Fired when the image can't be displayed (e.g. a remote link that isn't an image). */
  onError?: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [loading, setLoading] = useState(true)
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const paneRef = useRef<HTMLDivElement>(null)

  const reset = useCallback(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  // Reset zoom/pan AND show the preloader whenever the source changes (e.g. when
  // stepping to the next document — remote images take a moment to load).
  useEffect(() => {
    reset()
    setLoading(true)
  }, [src, reset])

  // Wheel-to-zoom via a NATIVE non-passive listener — React's onWheel is passive,
  // so preventDefault() there is ignored (and warns). This stops the page/dialog
  // from scrolling while zooming the image.
  useEffect(() => {
    const el = paneRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      setScale((s) => Math.min(8, Math.max(0.2, s - e.deltaY * 0.0015 * s)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const onPointerDown = (e: React.PointerEvent): void => {
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
  }
  const onPointerMove = (e: React.PointerEvent): void => {
    if (!drag.current) return
    setOffset({
      x: drag.current.ox + (e.clientX - drag.current.x),
      y: drag.current.oy + (e.clientY - drag.current.y)
    })
  }
  const onPointerUp = (): void => {
    drag.current = null
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg bg-black/40">
      <div
        ref={paneRef}
        className="h-full w-full cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          onLoad={() => setLoading(false)}
          onError={() => {
            setLoading(false)
            onError?.()
          }}
          className="pointer-events-none mx-auto h-full w-full select-none object-contain"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transition: drag.current ? 'none' : 'transform 0.08s ease-out',
            opacity: loading ? 0 : 1
          }}
        />
      </div>
      {loading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-9 w-9 animate-spin text-white/70" />
        </div>
      )}
      <div className="glass-strong absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-2xl p-1">
        <Button
          variant="ghost"
          size="icon"
          title={t('documents.zoomOut')}
          onClick={() => setScale((s) => Math.max(0.2, s - 0.25))}
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">
          {Math.round(scale * 100)}%
        </span>
        <Button
          variant="ghost"
          size="icon"
          title={t('documents.zoomIn')}
          onClick={() => setScale((s) => Math.min(8, s + 0.25))}
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" title={t('documents.reset')} onClick={reset}>
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
