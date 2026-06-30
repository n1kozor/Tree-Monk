import { useTranslation } from 'react-i18next'
import { ExternalLink, Heart } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { RevolutQr } from './RevolutQr'
import { PayPalQr } from './PayPalQr'

const REVOLUT_URL = 'http://revolut.me/attilaj9nv'
const PAYPAL_URL = 'https://paypal.me/TreeV1Monk'

/**
 * Optional, no-pressure donation prompt. The app stays free forever; this only
 * supports development. Offers Revolut and PayPal — each with a scannable QR
 * (embedded so it works offline) plus a tappable link.
 */
export function SupportDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}): JSX.Element {
  const { t } = useTranslation()

  const methods = [
    { name: 'Revolut', label: 'revolut.me/attilaj9nv', url: REVOLUT_URL, Qr: RevolutQr },
    { name: 'PayPal', label: 'paypal.me/TreeV1Monk', url: PAYPAL_URL, Qr: PayPalQr }
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="h-4 w-4 text-primary" />
            {t('support.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p className="leading-relaxed text-muted-foreground">{t('support.intro')}</p>

          {methods.map(({ name, label, url, Qr }) => (
            <div key={name} className="flex items-center gap-3 rounded-xl border border-border/40 p-3">
              <div className="shrink-0 rounded-lg bg-white p-1.5 ring-1 ring-border">
                <Qr className="h-24 w-24" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{name}</p>
                <p className="mb-2 text-[11px] text-muted-foreground">{t('support.scan')}</p>
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

          <p className="text-center text-[13px] font-medium text-primary">{t('support.thanks')}</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
