import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, ChevronDown, Loader2, Square, TreeDeciduous, X, XCircle } from 'lucide-react'
import { useFsImport } from '@/store/useFsImport'
import { describe, mapError } from './fsStatus'

/**
 * Sleek, non-intrusive floating status card for a background FamilySearch
 * import. Sits in the bottom-left corner (Sonner toasts live bottom-right), so
 * the rest of the app stays fully interactive while the import streams progress.
 */
export function FamilySearchProgress(): JSX.Element {
  const { t } = useTranslation()
  const active = useFsImport((s) => s.active)
  const running = useFsImport((s) => s.running)
  const current = useFsImport((s) => s.current)
  const log = useFsImport((s) => s.log)
  const peopleAdded = useFsImport((s) => s.peopleAdded)
  const result = useFsImport((s) => s.result)
  const error = useFsImport((s) => s.error)
  const minimized = useFsImport((s) => s.minimized)
  const stopping = useFsImport((s) => s.stopping)
  const dismiss = useFsImport((s) => s.dismiss)
  const stop = useFsImport((s) => s.stop)
  const setMinimized = useFsImport((s) => s.setMinimized)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [log, current])

  // Auto-dismiss a successful import after a short while.
  useEffect(() => {
    if (!result) return
    const id = setTimeout(() => dismiss(), 8000)
    return () => clearTimeout(id)
  }, [result, dismiss])

  return (
    <AnimatePresence>
      {active && minimized && (
        <motion.button
          key="fs-pill"
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          onClick={() => setMinimized(false)}
          title={t('fs.title')}
          className="fixed bottom-4 left-0 right-0 mx-auto z-[80] flex w-fit items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-2 shadow-2xl backdrop-blur-md hover:bg-accent"
        >
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : error ? (
            <XCircle className="h-4 w-4 text-destructive" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          )}
          <span className="text-xs font-medium">
            {t('fs.title')}
            {running && peopleAdded > 0 ? ` · ${peopleAdded}` : ''}
          </span>
        </motion.button>
      )}
      {active && !minimized && (
        <motion.div
          key="fs-card"
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          className="fixed bottom-4 left-0 right-0 mx-auto z-[80] w-80 overflow-hidden rounded-xl border border-border bg-card/95 shadow-2xl backdrop-blur-md"
        >
          <div className="flex items-center gap-1 border-b border-border/60 px-3 py-2">
            <TreeDeciduous className="h-4 w-4 shrink-0 text-primary" />
            <span className="flex-1 truncate text-sm font-semibold">{t('fs.title')}</span>
            {running && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />}
            {running && (
              <button
                onClick={stop}
                disabled={stopping}
                title={t('fs.stop')}
                className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                <Square className="h-3 w-3 fill-current" />
                {stopping ? t('fs.stopping') : t('fs.stop')}
              </button>
            )}
            {/* Collapse so the card stops covering the settings underneath. */}
            <button
              onClick={() => setMinimized(true)}
              title={t('fs.minimize')}
              className="rounded-md p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            {!running && (
              <button
                onClick={dismiss}
                title={t('common.close')}
                className="rounded-md p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="space-y-1.5 px-3 py-2.5">
            {/* Live counter — grows as nodes stream in. */}
            {running && peopleAdded > 0 && (
              <p className="text-sm font-semibold tabular-nums text-primary">
                {t('fs.fetched', { count: peopleAdded })}
              </p>
            )}

            {/* Live status headline (updates in place for per-person ticks). */}
            {running && (
              <p className="truncate text-xs text-foreground">
                {current ? describe(t, current) : t('fs.statusAuth')}
              </p>
            )}

            {/* Bounded milestone log. */}
            {log.length > 0 && !result && !error && (
              <div
                ref={logRef}
                className="max-h-24 overflow-y-auto rounded-md bg-secondary/40 p-2 font-mono text-[10px] leading-relaxed text-muted-foreground"
              >
                {log.slice(-6).map((s, i) => (
                  <div key={i} className="truncate">
                    <span className="text-primary">›</span> {describe(t, s)}
                  </div>
                ))}
              </div>
            )}

            {result && (
              <div className="flex items-start gap-1.5 text-xs text-emerald-500">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {t('fs.importedDetail', {
                  created: result.peopleCreated ?? result.people,
                  updated: result.peopleUpdated ?? 0,
                  families: result.families
                })}
              </div>
            )}

            {error && (
              <div className="flex items-start gap-1.5 text-xs text-destructive">
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {mapError(t, new Error(error))}
              </div>
            )}

            {running && (
              <p className="pt-0.5 text-[10px] text-muted-foreground/70">{t('fs.background')}</p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
