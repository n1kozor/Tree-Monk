import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Loader2, Maximize2, TreeDeciduous, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store/useAppStore'
import { useSettings } from '@/store/useSettings'

/**
 * Floating progress pill for a background FamilySearch import. Sits at the
 * bottom-left just to the RIGHT of the sidebar (offset tracks the collapsed
 * state) so it never overlaps the nav, and lets the user watch the tree grow
 * live. Click to expand into a detail dialog; minimize back to the pill.
 */
export function FsImportPill(): JSX.Element | null {
  const { t } = useTranslation()
  const imp = useAppStore((s) => s.fsImport)
  const clear = useAppStore((s) => s.clearFsImport)
  const expanded = useAppStore((s) => s.fsImportExpanded)
  const setExpanded = useAppStore((s) => s.setFsImportExpanded)
  const collapsed = useSettings((s) => s.sidebarCollapsed)

  // Right of the sidebar: w-16 (4rem) collapsed, w-56 (14rem) expanded.
  const left = collapsed ? '4.75rem' : '15rem'

  return (
    <>
      <AnimatePresence>
        {imp && !expanded && (
          <motion.div
            key="fs-import-pill"
            initial={{ opacity: 0, y: 24, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.9 }}
            style={{ left }}
            className="glass-strong fixed bottom-4 z-[130] flex items-center gap-3 overflow-hidden rounded-2xl border-2 border-emerald-500/60 py-2.5 pl-3 pr-3 text-sm shadow-xl shadow-emerald-500/25 ring-1 ring-emerald-500/20"
          >
            {imp.running && (
              <motion.span
                className="absolute inset-0 -z-10 bg-emerald-500/10"
                animate={{ opacity: [0.25, 0.6, 0.25] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
            <button
              onClick={() => setExpanded(true)}
              className="flex min-w-0 items-center gap-3 text-left"
              title={t('fsImport.open')}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600">
                {imp.running ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : imp.phase === 'error' ? (
                  <X className="h-5 w-5 text-rose-500" />
                ) : (
                  <CheckCircle2 className="h-5 w-5" />
                )}
              </span>
              <div className="flex min-w-0 flex-col items-start leading-tight">
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                  {imp.running
                    ? imp.phase === 'auth'
                      ? t('fs.phaseAuth')
                      : t('fsImport.growing')
                    : imp.phase === 'error'
                      ? t('fs.importFailed')
                      : t('fsImport.done', { people: imp.people, families: imp.families })}
                </span>
                {imp.running && (
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <TreeDeciduous className="h-3 w-3 text-emerald-500" />
                    <span className="max-w-[190px] truncate">
                      {imp.name ? t('fs.importingCount', { name: imp.name, count: imp.count }) : t('fs.importing')}
                    </span>
                  </span>
                )}
              </div>
            </button>

            {imp.running ? (
              <Maximize2
                className="h-4 w-4 shrink-0 cursor-pointer text-emerald-600/70 hover:text-emerald-600"
                onClick={() => setExpanded(true)}
              />
            ) : (
              <button
                onClick={clear}
                title={t('common.close')}
                className="ml-1 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {imp && expanded && (
        <Dialog open onOpenChange={(v) => !v && setExpanded(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 pr-8">
                <TreeDeciduous className="h-5 w-5 shrink-0 text-emerald-600" />
                <span>{t('fs.title')}</span>
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-4">
              {imp.running ? (
                <>
                  <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
                  <p className="text-center text-sm font-medium">
                    {imp.phase === 'auth' ? t('fs.phaseAuth') : t('fsImport.growing')}
                  </p>
                  {imp.name && (
                    <p className="text-center text-xs text-muted-foreground">
                      {t('fs.importingCount', { name: imp.name, count: imp.count })}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                  <p className="text-center text-sm font-medium text-emerald-600 dark:text-emerald-400">
                    {t('fsImport.done', { people: imp.people, families: imp.families })}
                  </p>
                </>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setExpanded(false)}>
                  {t('fsImport.minimize')}
                </Button>
                {!imp.running && <Button onClick={clear}>{t('common.close')}</Button>}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
