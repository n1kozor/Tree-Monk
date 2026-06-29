import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock, X } from 'lucide-react'

/** A small, dismissible fixed pill marking the build as a read-only demo. */
export function DemoBanner(): JSX.Element | null {
  const { t } = useTranslation()
  const [open, setOpen] = useState(true)
  if (!open) return null
  return (
    <div className="pointer-events-none fixed bottom-3 left-1/2 z-[200] -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-border bg-popover/95 px-3.5 py-1.5 text-xs shadow-2xl backdrop-blur">
        <Lock className="h-3.5 w-3.5 text-primary" />
        <span className="font-medium text-foreground">{t('demo.bannerLabel')}</span>
        <span className="text-muted-foreground">{t('demo.bannerNote')}</span>
        <a
          href="https://treemonk.eu"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-primary hover:underline"
        >
          {t('demo.download')}
        </a>
        <button
          onClick={() => setOpen(false)}
          className="text-muted-foreground hover:text-foreground"
          title={t('demo.hide')}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
