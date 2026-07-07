import { useTranslation } from 'react-i18next'
import { CheckCircle2, Network, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAppStore } from '@/store/useAppStore'

/**
 * Unmissable end-of-import summary. A transient toast is easy to miss (and on
 * the corkboard nothing visibly changes after an import) — this dialog stays
 * until dismissed and offers to jump straight to the imported people/tree.
 */
export function GedcomSummaryDialog(): JSX.Element | null {
  const { t } = useTranslation()
  const summary = useAppStore((s) => s.gedcomSummary)
  const setGedcomSummary = useAppStore((s) => s.setGedcomSummary)
  const setView = useAppStore((s) => s.setView)

  if (!summary) return null
  const created = summary.peopleCreated ?? summary.people
  const updated = summary.peopleUpdated ?? 0

  const go = (view: 'people' | 'tree'): void => {
    setGedcomSummary(null)
    setView(view)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && setGedcomSummary(null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            {t('gedcom.summaryTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2 text-center">
          {(
            [
              { n: created, label: t('gedcom.summaryCreated') },
              { n: updated, label: t('gedcom.summaryUpdated') },
              { n: summary.families, label: t('gedcom.summaryFamilies') }
            ] as const
          ).map(({ n, label }, i) => (
            <div key={i} className="rounded-xl bg-secondary/40 px-2 py-3">
              <p className="text-2xl font-bold tabular-nums text-primary">{n}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{t('gedcom.summaryHint')}</p>

        <div className="flex gap-2">
          <Button className="flex-1 gap-2" onClick={() => go('people')}>
            <Users className="h-4 w-4" />
            {t('gedcom.summaryOpenPeople')}
          </Button>
          <Button variant="outline" className="flex-1 gap-2" onClick={() => go('tree')}>
            <Network className="h-4 w-4" />
            {t('gedcom.summaryOpenTree')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
