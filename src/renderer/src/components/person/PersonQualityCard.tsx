import { useTranslation } from 'react-i18next'
import { CheckCircle2, Sparkles } from 'lucide-react'
import type { Person } from '@shared/types'
import { personQuality } from '@/lib/completeness'
import { useAppStore } from '@/store/useAppStore'
import { QualityRing } from '@/components/common/QualityRing'

/**
 * Prominent per-person data-quality card: a circular gauge + the list of fields
 * still missing, so the user sees at a glance how complete the record is and what
 * to fill next.
 */
export function PersonQualityCard({ person }: { person: Person }): JSX.Element {
  const { t } = useTranslation()
  const occSet = useAppStore((s) => s.occupationPersonIds)
  const q = personQuality(person, occSet)
  const complete = q.missing.length === 0

  return (
    <div className="glass flex items-center gap-4 rounded-2xl p-4">
      <QualityRing value={q.score} size={68} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> {t('quality.title')}
        </p>
        {complete ? (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> {t('quality.complete')}
          </p>
        ) : (
          <>
            <p className="mt-1 text-[11px] text-muted-foreground">{t('quality.missing')}</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {q.missing.map((f) => (
                <span key={f} className="rounded-md bg-secondary/40 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {t(`quality.field.${f}`)}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
