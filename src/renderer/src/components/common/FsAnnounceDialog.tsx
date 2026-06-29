import { useTranslation } from 'react-i18next'
import { TreeDeciduous } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

/**
 * One-time notice that the new FamilySearch API connection is in development.
 * Shown once shortly after launch, BEFORE the support invitation. Closing it
 * (any way) records the flag so it never appears again.
 */
export function FsAnnounceDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}): JSX.Element {
  const { t } = useTranslation()

  const close = (): void => {
    void window.api.fsAnnounce?.markSeen?.()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8">
            <TreeDeciduous className="h-5 w-5 shrink-0 text-emerald-600" />
            <span>{t('fsAnnounce.title')}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>{t('fsAnnounce.body')}</p>
          <p>{t('fsAnnounce.body2')}</p>
        </div>
        <div className="flex justify-end">
          <Button onClick={close}>{t('fsAnnounce.ok')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
