import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, ImageDown, Loader2 } from 'lucide-react'
import type { MediaDownloadProgress as Progress } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'

/**
 * Floating, non-intrusive progress card for the background remote-media (image)
 * download kicked off after a GEDCOM import. Subscribes to main-process progress
 * events; refreshes the store when finished so freshly-downloaded photos (and
 * any profile pictures) appear immediately. Sits bottom-left, above the
 * FamilySearch card so the two never collide.
 */
export function MediaDownloadProgress(): JSX.Element | null {
  const { t } = useTranslation()
  const refreshAll = useAppStore((s) => s.refreshAll)
  const [prog, setProg] = useState<Progress | null>(null)
  const [finished, setFinished] = useState(false)

  useEffect(() => {
    const off = window.api?.media?.onDownloadProgress?.((p) => {
      setProg(p)
      if (p.total > 0 && p.done >= p.total) {
        setFinished(true)
        void refreshAll()
        setTimeout(() => setProg(null), 6000)
      } else {
        setFinished(false)
      }
    })
    return off
  }, [refreshAll])

  if (!prog || prog.total === 0) return null
  const pct = Math.round((prog.done / prog.total) * 100)

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        className="glass fixed bottom-24 left-0 right-0 mx-auto z-[78] w-72 overflow-hidden rounded-2xl text-card-foreground"
      >
        <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
          <ImageDown className="h-4 w-4 text-primary" />
          <span className="flex-1 text-sm font-semibold">{t('media.downloadTitle')}</span>
          {finished ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          )}
        </div>
        <div className="px-3 py-2.5">
          <div className="mb-1.5 h-2 w-full overflow-hidden rounded-full bg-secondary/50">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="tabular-nums">
              {prog.done} / {prog.total}
            </span>
            <span className="tabular-nums">
              {finished ? t('media.downloadDone', { ok: prog.ok }) : `${pct}%`}
              {prog.failed > 0 && ` · ${t('media.downloadFailed', { n: prog.failed })}`}
            </span>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
