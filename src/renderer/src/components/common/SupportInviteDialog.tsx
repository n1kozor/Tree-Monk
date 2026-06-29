import { useTranslation } from 'react-i18next'
import { ExternalLink, Heart } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { RevolutQr } from './RevolutQr'
import { PayPalQr } from './PayPalQr'

const REVOLUT_URL = 'http://revolut.me/attilaj9nv'
const PAYPAL_URL = 'https://paypal.me/TreeV1Monk'

/**
 * One-time, no-pressure support invitation shown once after launch. It is NOT a
 * paywall and NOT expected — it only explains that a contribution helps the work,
 * development and testing, and that support is available anytime from the ❤
 * button at the top of the left sidebar. Closing it (any way) records the flag so
 * it never appears again — being nagged would be annoying.
 */
export function SupportInviteDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}): JSX.Element {
  const { t } = useTranslation()

  // Mark seen on ANY close so it truly never shows again.
  const close = (): void => {
    void window.api.supportInvite?.markSeen?.()
    onOpenChange(false)
  }

  const methods = [
    { name: t('supportInvite.method'), label: 'revolut.me/attilaj9nv', url: REVOLUT_URL, Qr: RevolutQr, hint: t('supportInvite.transferHint') },
    { name: 'PayPal', label: 'paypal.me/TreeV1Monk', url: PAYPAL_URL, Qr: PayPalQr, hint: t('support.scan') }
  ]

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="h-4 w-4 text-rose-500" />
            {t('supportInvite.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p className="leading-relaxed text-muted-foreground">{t('supportInvite.body')}</p>

          {methods.map(({ name, label, url, Qr, hint }) => (
            <div key={name} className="flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
              <div className="shrink-0 rounded-lg bg-white p-1.5 ring-1 ring-border">
                <Qr className="h-24 w-24" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{name}</p>
                <p className="mb-2 text-[11px] text-muted-foreground">{hint}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5"
                  onClick={() => void window.api.app.openExternal(url)}
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{label}</span>
                </Button>
              </div>
            </div>
          ))}

          <p className="rounded-lg bg-secondary/40 px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
            {t('supportInvite.anytime')}
          </p>

          <Button className="w-full" onClick={close}>
            {t('supportInvite.ok')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
