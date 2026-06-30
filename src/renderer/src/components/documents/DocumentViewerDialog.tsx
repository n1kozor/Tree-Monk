import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, ExternalLink, ImageOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { mediaUrl } from '@/lib/mediaUrl'
import { ImageViewer } from './ImageViewer'
import type { DocumentRecord } from '@shared/types'

/**
 * The full-screen, pageable document viewer modal. Steps through `list` (the
 * surrounding viewable documents) with on-screen arrows and the ←/→ keys, shows
 * the deep-zoom image, and falls back to "open in browser" when a remote link
 * turns out not to be an image. Shared by the Documents page and a person's
 * Sources tab so both behave identically.
 */
export function DocumentViewerDialog({
  list,
  active,
  onActiveChange
}: {
  list: DocumentRecord[]
  active: DocumentRecord | null
  onActiveChange: (d: DocumentRecord | null) => void
}): JSX.Element {
  const { t } = useTranslation()
  const [viewerError, setViewerError] = useState(false)

  const activeUrl = active ? mediaUrl(active.id) : null
  const idx = active ? list.findIndex((d) => d.id === active.id) : -1
  const goPrev = useCallback(() => {
    if (idx > 0) onActiveChange(list[idx - 1])
  }, [idx, list, onActiveChange])
  const goNext = useCallback(() => {
    if (idx >= 0 && idx < list.length - 1) onActiveChange(list[idx + 1])
  }, [idx, list, onActiveChange])

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowLeft') goPrev()
      else if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, goPrev, goNext])

  useEffect(() => setViewerError(false), [active])

  return (
    <Dialog open={!!active} onOpenChange={(o) => !o && onActiveChange(null)}>
      <DialogContent className="flex h-[85vh] max-w-5xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            <span className="truncate">{active?.title || t('common.untitled')}</span>
            {list.length > 1 && idx >= 0 && (
              <span className="shrink-0 text-xs font-normal tabular-nums text-muted-foreground">
                {idx + 1} / {list.length}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="relative min-h-0 flex-1">
          {activeUrl && !viewerError && (
            <ImageViewer src={activeUrl} alt={active?.title} onError={() => setViewerError(true)} />
          )}
          {viewerError && active && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
              <ImageOff className="h-10 w-10 opacity-50" />
              <p className="max-w-xs text-sm">{t('documents.notImage')}</p>
              {/^https?:\/\//i.test(active.filePath) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => active && void window.api.app.openExternal(active.filePath)}
                >
                  <ExternalLink className="h-4 w-4" />
                  {t('documents.openInBrowser')}
                </Button>
              )}
            </div>
          )}
          {list.length > 1 && idx >= 0 && (
            <>
              <button
                onClick={goPrev}
                disabled={idx <= 0}
                title={t('documents.prev')}
                className="glass-strong absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={goNext}
                disabled={idx >= list.length - 1}
                title={t('documents.next')}
                className="glass-strong absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
