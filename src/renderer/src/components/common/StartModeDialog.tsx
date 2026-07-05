import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ModeChooser } from './ModeChooser'
import { markStartChoiceSeen, setFsMode } from '@/lib/fsMode'

/**
 * First-launch choice on an empty database: FamilySearch mode or Manual/GEDCOM
 * mode. The modes are strictly separated; the chooser requires an explicit
 * confirmation after a detailed description.
 */
export function StartModeDialog({
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
    markStartChoiceSeen()
    setFsMode(fs)
    onOpenChange(false)
    if (fs) onChooseFs()
  }
  return (
    <Dialog open={open} onOpenChange={() => undefined}>
      <DialogContent className="max-w-xl" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="pr-8">{t('start.title')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t('start.intro')}</p>
        <ModeChooser onDone={done} />
      </DialogContent>
    </Dialog>
  )
}
