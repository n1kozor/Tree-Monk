import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ModeChooser } from './ModeChooser'
import { markReimportNoticeSeen, setFsMode } from '@/lib/fsMode'

/**
 * One-time notice for users upgrading with an EXISTING database: the new
 * FamilySearch integration needs a fresh import. The same strict two-step
 * chooser as the first launch — Manual keeps everything as-is.
 */
export function ReimportNoticeDialog({
  open,
  onOpenChange,
  onChooseFs
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onChooseFs: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const done = (fs: boolean): void => {
    markReimportNoticeSeen()
    setFsMode(fs)
    onOpenChange(false)
    if (fs) onChooseFs()
  }
  return (
    <Dialog open={open} onOpenChange={() => undefined}>
      <DialogContent className="max-w-xl" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="pr-8">{t('reimport.title')}</DialogTitle>
        </DialogHeader>
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t('reimport.warning')}</span>
        </div>
        <ModeChooser onDone={done} />
      </DialogContent>
    </Dialog>
  )
}
