import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useReactFlow } from '@xyflow/react'
import { toast } from 'sonner'
import { Baby, HeartHandshake, Search, Bird, Sparkles, UserSquare2, Users, Wand2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { PersonAvatar } from '@/components/common/PersonAvatar'
import { useAppStore } from '@/store/useAppStore'
import { useBoardStore } from './useBoardStore'
import { buildInvestigationPlan, type WizardFocus, type WizardRelation } from '@/lib/boardWizard'
import { cn, fullName, yearOf } from '@/lib/utils'
import { norm } from '@/lib/nameMatch'

const RELATIONS: { id: WizardRelation; icon: typeof Baby; defaultFocus: WizardFocus }[] = [
  { id: 'father', icon: UserSquare2, defaultFocus: 'birth' },
  { id: 'mother', icon: UserSquare2, defaultFocus: 'birth' },
  { id: 'child', icon: Baby, defaultFocus: 'birth' },
  { id: 'spouse', icon: HeartHandshake, defaultFocus: 'marriage' }
]
const FOCUSES: { id: WizardFocus; icon: typeof Baby }[] = [
  { id: 'birth', icon: Baby },
  { id: 'marriage', icon: HeartHandshake },
  { id: 'death', icon: Bird }
]
const MAX_RESULTS = 40

export function BoardWizard({
  open,
  onOpenChange,
  spawnAt
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  spawnAt: () => { x: number; y: number }
}): JSX.Element {
  const { t } = useTranslation()
  const people = useAppStore((s) => s.people)
  const families = useAppStore((s) => s.families)
  const peopleById = useAppStore((s) => s.peopleById)
  const assemble = useBoardStore((s) => s.assembleInvestigation)
  const { fitView } = useReactFlow()

  const [step, setStep] = useState<1 | 2>(1)
  const [relation, setRelation] = useState<WizardRelation>('father')
  const [focus, setFocus] = useState<WizardFocus>('birth')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setStep(1)
      setRelation('father')
      setFocus('birth')
      setQ('')
    }
  }, [open])

  const matches = useMemo(() => {
    const nq = norm(q)
    const out: typeof people = []
    for (const p of people) {
      if (!nq || norm(fullName(p)).includes(nq) || norm(p.birthPlace ?? '').includes(nq)) {
        out.push(p)
        if (out.length >= MAX_RESULTS) break
      }
    }
    return out
  }, [people, q])

  const generate = async (anchorId: string): Promise<void> => {
    const anchor = peopleById.get(anchorId)
    if (!anchor || busy) return
    setBusy(true)
    try {
      const [documents, logs] = await Promise.all([
        window.api.documents.listForPerson(anchorId),
        window.api.research.logsForPerson(anchorId)
      ])
      const plan = buildInvestigationPlan({ relation, focus, anchor, families, peopleById, documents, logs, t })
      const ids = assemble(plan, spawnAt())
      onOpenChange(false)
      // Let the nodes mount, then frame the freshly-built cluster.
      setTimeout(() => fitView({ nodes: ids.map((id) => ({ id })), duration: 700, padding: 0.25 }), 80)
      toast.success(t('board.wizard.created'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="flex max-h-[82vh] max-w-lg flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" /> {t('board.wizard.title')}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {t('board.wizard.step', { n: step, total: 2 })} · {t(`board.wizard.stepName.${step}`)}
          </p>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t('board.wizard.q1')}</p>
              <div className="grid grid-cols-2 gap-2">
                {RELATIONS.map(({ id, icon: Icon, defaultFocus }) => (
                  <button
                    key={id}
                    onClick={() => {
                      setRelation(id)
                      setFocus(defaultFocus)
                    }}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border p-2.5 text-left text-sm transition-colors',
                      relation === id ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-accent'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="font-medium">{t(`board.wizard.rel.${id}`)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t('board.wizard.q2')}</p>
              <div className="grid grid-cols-3 gap-2">
                {FOCUSES.map(({ id, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setFocus(id)}
                    className={cn(
                      'flex items-center justify-center gap-1.5 rounded-lg border p-2 text-xs font-medium transition-colors',
                      focus === id ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-accent'
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t(`board.wizard.focus.${id}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <Button size="sm" className="gap-1.5" onClick={() => setStep(2)}>
                {t('common.next')} →
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <p className="text-sm font-medium">{t(`board.wizard.pickFor.${relation}`)}</p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('common.search')} className="h-9 pl-8" autoFocus />
            </div>
            <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
              {matches.map((p) => {
                const yrs = [yearOf(p.birthDate), yearOf(p.deathDate)].join('–').replace(/^–$/, '')
                const sub = [yrs, (p.birthPlace ?? '').split(',')[0].trim()].filter(Boolean).join(' · ')
                return (
                  <button
                    key={p.id}
                    disabled={busy}
                    onClick={() => void generate(p.id)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-accent disabled:opacity-60"
                  >
                    <PersonAvatar personId={p.id} name={fullName(p)} sex={p.sex} className="h-8 w-8 shrink-0 text-[10px]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{fullName(p)}</span>
                      {sub && <span className="block truncate text-[11px] text-muted-foreground">{sub}</span>}
                    </span>
                    <Sparkles className="h-4 w-4 shrink-0 text-primary/70" />
                  </button>
                )
              })}
              {people.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">{t('board.wizard.noPeople')}</p>
              )}
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                ← {t('common.back')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
