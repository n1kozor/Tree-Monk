import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ChevronRight, Loader2, Maximize2, Minimize2, RefreshCw, Trash2, TreeDeciduous } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store/useAppStore'

/**
 * Read-only FamilySearch change scan. Iterates every FS-linked person and
 * reports (WITHOUT importing anything) where FamilySearch data changed, new
 * data appeared, or a person was deleted/merged. Runs in the store so it keeps
 * going when minimized; results badge the tree cards live.
 */
export function FsScanDialog({ onOpenPerson }: { onOpenPerson: (personId: string) => void }): JSX.Element | null {
  const { t } = useTranslation()
  const scan = useAppStore((s) => s.fsScan)
  const minimized = useAppStore((s) => s.fsScanMinimized)
  const setMinimized = useAppStore((s) => s.setFsScanMinimized)
  const cancel = useAppStore((s) => s.cancelFsScan)
  const clear = useAppStore((s) => s.clearFsScan)

  if (!scan || minimized) return null

  const changed = scan.results.filter((r) => r.status === 'changed')
  const deleted = scan.results.filter((r) => r.status === 'deleted')
  const pct = scan.total ? Math.round((scan.done / scan.total) * 100) : 100

  return (
    <Dialog open onOpenChange={(v) => !v && setMinimized(true)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-16">
            <TreeDeciduous className="h-5 w-5 shrink-0 text-emerald-600" />
            <span>{t('fsScan.title')}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Minimize is offered prominently — the scan keeps running in the bg. */}
        <button
          onClick={() => setMinimized(true)}
          title={t('fsScan.minimize')}
          className="absolute right-12 top-4 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Minimize2 className="h-4 w-4" />
        </button>

        <p className="text-sm text-muted-foreground">{t('fsScan.intro')}</p>

        {/* Progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {scan.running ? t('fsScan.scanning') : t('fsScan.done')} · {scan.done}/{scan.total}
            </span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* Summary chips */}
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-700 dark:text-emerald-400">
            {t('fsScan.changedCount', { count: changed.length })}
          </span>
          {deleted.length > 0 && (
            <span className="rounded-full bg-rose-500/10 px-2.5 py-1 font-medium text-rose-700 dark:text-rose-400">
              {t('fsScan.deletedCount', { count: deleted.length })}
            </span>
          )}
        </div>

        {/* Results */}
        <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
          {deleted.map((r) => (
            <div
              key={r.personId}
              className="flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm"
            >
              <Trash2 className="h-4 w-4 shrink-0 text-rose-600" />
              <span className="font-medium">{r.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">{t('fsScan.deletedTag')}</span>
            </div>
          ))}
          {changed.map((r) => (
            <button
              key={r.personId}
              onClick={() => onOpenPerson(r.personId)}
              className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
            >
              <RefreshCw className="h-4 w-4 shrink-0 text-emerald-600" />
              <span className="font-medium">{r.name}</span>
              <span className="ml-auto flex gap-1.5 text-xs text-muted-foreground">
                {r.fields > 0 && <span>{t('fsScan.fields', { count: r.fields })}</span>}
                {r.relatives > 0 && <span>{t('fsScan.relatives', { count: r.relatives })}</span>}
                {r.content > 0 && <span>{t('fsScan.content', { count: r.content })}</span>}
              </span>
            </button>
          ))}
          {!scan.running && changed.length === 0 && deleted.length === 0 && (
            <p className="rounded-lg border border-border bg-muted/40 p-3 text-center text-sm text-muted-foreground">
              {t('fsScan.allUpToDate')}
            </p>
          )}
        </div>

        <DialogFooter>
          {scan.running ? (
            <>
              <Button variant="outline" onClick={cancel} className="gap-2">
                <AlertTriangle className="h-4 w-4" /> {t('fsScan.stop')}
              </Button>
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> {t('fsScan.running')}
              </span>
            </>
          ) : (
            <Button onClick={clear} className="gap-2">
              {t('fsScan.finish')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Floating pill shown while the scan runs minimized — click to reopen. */
export function FsScanPill(): JSX.Element | null {
  const { t } = useTranslation()
  const scan = useAppStore((s) => s.fsScan)
  const minimized = useAppStore((s) => s.fsScanMinimized)
  const setMinimized = useAppStore((s) => s.setFsScanMinimized)

  if (!scan || !minimized) return null
  const changed = scan.results.filter((r) => r.status !== 'ok').length
  const pct = scan.total ? Math.round((scan.done / scan.total) * 100) : 100

  return (
    <motion.button
      onClick={() => setMinimized(false)}
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="glass-strong group absolute bottom-4 left-4 z-[120] flex items-center gap-3 overflow-hidden rounded-2xl border-2 border-emerald-500/60 py-2.5 pl-3 pr-4 text-sm shadow-xl shadow-emerald-500/20 ring-1 ring-emerald-500/20 transition-all hover:scale-[1.04] hover:border-emerald-500 hover:shadow-emerald-500/40"
    >
      {/* Pulsing glow while scanning. */}
      {scan.running && (
        <motion.span
          className="absolute inset-0 -z-10 bg-emerald-500/10"
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600">
        {scan.running ? <Loader2 className="h-5 w-5 animate-spin" /> : <TreeDeciduous className="h-5 w-5" />}
      </span>
      <div className="flex flex-col items-start leading-tight">
        <span className="font-semibold text-emerald-700 dark:text-emerald-400">
          {scan.running ? t('fsScan.pillScanning', { pct }) : t('fsScan.pillDone', { count: changed })}
        </span>
        <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
          {t('fsScan.pillOpen')} <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
      <Maximize2 className="h-4 w-4 shrink-0 text-emerald-600/70" />
    </motion.button>
  )
}
