import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Database, Eye, Lock, TreePine } from 'lucide-react'

const SEEN_KEY = 'treemonk.demoIntroSeen'

/** A one-time welcome dialog shown when the read-only demo opens. */
export function DemoIntroModal(): JSX.Element | null {
  const { t } = useTranslation()
  const [open, setOpen] = useState(() => localStorage.getItem(SEEN_KEY) !== '1')
  if (!open) return null

  const close = (): void => {
    localStorage.setItem(SEEN_KEY, '1')
    setOpen(false)
  }

  const points = [
    { icon: Database, text: t('demo.introSample') },
    { icon: Lock, text: t('demo.introReadonly') },
    { icon: Eye, text: t('demo.introExplore') }
  ]

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <TreePine className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">{t('demo.introTitle')}</h2>
            <p className="text-xs text-muted-foreground">{t('demo.introSubtitle')}</p>
          </div>
        </div>

        <p className="mb-4 text-sm text-muted-foreground">{t('demo.introBody')}</p>

        <ul className="mb-5 space-y-2.5">
          {points.map((p, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm">
              <p.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span className="text-foreground">{p.text}</span>
            </li>
          ))}
        </ul>

        <button
          onClick={close}
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {t('demo.introCta')}
        </button>
      </div>
    </div>
  )
}
