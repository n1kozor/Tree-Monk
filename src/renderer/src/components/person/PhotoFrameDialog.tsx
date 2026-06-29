import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImageUp, RotateCcw, ZoomIn } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { mediaThumb } from '@/lib/mediaUrl'
import {
  DEFAULT_FRAME,
  frameOverflow,
  frameStyle,
  frameToJson,
  parseFrame,
  type PhotoFrame
} from '@/lib/photoFrame'
import { fullName } from '@/lib/utils'
import type { Person } from '@shared/types'

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n)

/**
 * Lets the user reposition (drag) and zoom (slider) a profile photo so a cut-off
 * head can be framed. The preview uses the EXACT same CSS as PersonAvatar, so
 * what you see here is what every avatar will show.
 */
export function PhotoFrameDialog({
  open,
  person,
  onOpenChange,
  onChanged,
  onReplace
}: {
  open: boolean
  person: Person
  onOpenChange: (v: boolean) => void
  /** Called with the updated person after the framing is saved. */
  onChanged: (p: Person) => void
  /** Open the file picker to swap the photo entirely. */
  onReplace: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const [frame, setFrame] = useState<PhotoFrame>(() => parseFrame(person.profilePhotoCrop))
  const [saving, setSaving] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)

  const url = person.profilePhotoId ? mediaThumb(person.profilePhotoId, 512) : null

  const onPointerDown = (e: React.PointerEvent): void => {
    drag.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent): void => {
    if (!drag.current) return
    const box = boxRef.current
    if (!box) return
    const dx = e.clientX - drag.current.x
    const dy = e.clientY - drag.current.y
    drag.current = { x: e.clientX, y: e.clientY }
    // Map the pixel drag to a pan fraction via the actual overflow, so the image
    // follows the cursor 1:1 and the full (zoom-dependent) range is reachable.
    setFrame((f) => {
      const ov = frameOverflow(f)
      const ovX = ov.x * box.clientWidth
      const ovY = ov.y * box.clientHeight
      return {
        ...f,
        x: ovX > 0 ? clamp01(f.x - dx / ovX) : f.x,
        y: ovY > 0 ? clamp01(f.y - dy / ovY) : f.y
      }
    })
  }

  // The image's real aspect ratio drives the pan range — read it once it loads
  // (overrides any stale stored value).
  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>): void => {
    const img = e.currentTarget
    if (!img.naturalWidth || !img.naturalHeight) return
    const a = img.naturalWidth / img.naturalHeight
    setFrame((f) => (Math.abs(f.a - a) < 0.0001 ? f : { ...f, a }))
  }
  const onPointerUp = (e: React.PointerEvent): void => {
    drag.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      const updated = await window.api.people.update(person.id, {
        profilePhotoCrop: frameToJson(frame)
      })
      onChanged(updated)
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('photo.frameTitle', { name: fullName(person) })}</DialogTitle>
        </DialogHeader>

        {url ? (
          <div className="flex flex-col items-center gap-4">
            <div
              ref={boxRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              className="relative h-64 w-64 cursor-grab touch-none select-none overflow-hidden rounded-full border-2 border-border bg-muted active:cursor-grabbing"
              title={t('photo.dragHint')}
            >
              <img
                src={url}
                alt={fullName(person)}
                className="pointer-events-none"
                style={frameStyle(frame)}
                draggable={false}
                onLoad={onImgLoad}
              />
            </div>
            <p className="text-center text-xs text-muted-foreground">{t('photo.dragHint')}</p>

            <div className="flex w-full items-center gap-2">
              <ZoomIn className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                type="range"
                min={1}
                max={4}
                step={0.02}
                value={frame.scale}
                onChange={(e) => setFrame((f) => ({ ...f, scale: Number(e.target.value) }))}
                className="h-2 w-full cursor-pointer accent-[hsl(var(--primary))]"
              />
              <button
                type="button"
                onClick={() => setFrame(DEFAULT_FRAME)}
                title={t('photo.reset')}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('photo.none')}</p>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={onReplace}>
            <ImageUp className="h-4 w-4" />
            {t('photo.replace')}
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" size="sm" disabled={!url || saving} onClick={() => void save()}>
              {t('common.save')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
