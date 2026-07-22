import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Sprout, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateInput } from '@/components/common/DateInput'
import { PlaceInput } from '@/components/common/PlaceInput'
import { useAppStore } from '@/store/useAppStore'
import type { Person, Sex } from '@shared/types'

/**
 * The empty-tree onboarding wizard: creates the very first person (usually
 * yourself or a known ancestor), makes them the tree's starting person and
 * points the user at the next steps (parents / spouse / children).
 */
export function FirstPersonWizard({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}): JSX.Element {
  const { t } = useTranslation()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [givenName, setGivenName] = useState('')
  const [surname, setSurname] = useState('')
  const [sex, setSex] = useState<Sex>('U')
  const [birthDate, setBirthDate] = useState('')
  const [birthPlace, setBirthPlace] = useState('')
  const [created, setCreated] = useState<Person | null>(null)
  const [busy, setBusy] = useState(false)

  const close = (v: boolean): void => {
    onOpenChange(v)
    if (!v) {
      setStep(1)
      setGivenName('')
      setSurname('')
      setSex('U')
      setBirthDate('')
      setBirthPlace('')
      setCreated(null)
    }
  }

  const nameOk = givenName.trim().length > 0 || surname.trim().length > 0

  const create = async (): Promise<void> => {
    if (busy || !nameOk) return
    setBusy(true)
    try {
      const person = await window.api.people.create({
        givenName: givenName.trim(),
        surname: surname.trim(),
        sex,
        birthDate: birthDate.trim() || null,
        birthPlace: birthPlace.trim() || null
      })
      const store = useAppStore.getState()
      await store.refreshAll()
      // The very first person IS the tree's starting person ("me").
      await store.setDefaultRoot(person.id)
      store.focusPersonTree(person.id)
      setCreated(person)
      setStep(3)
    } finally {
      setBusy(false)
    }
  }

  const sexBtn = (v: Sex, label: string): JSX.Element => (
    <button
      type="button"
      onClick={() => setSex(v)}
      className={cn(
        'flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
        sex === v
          ? 'border-primary/40 bg-primary/15 text-primary'
          : 'border-border bg-secondary/40 text-muted-foreground hover:text-foreground'
      )}
    >
      {label}
    </button>
  )

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md overflow-hidden bg-card" data-testid="first-person-wizard">
        <DialogHeader className="min-w-0">
          <DialogTitle className="flex items-center gap-2">
            <Sprout className="h-5 w-5 text-primary" />
            {t('firstPerson.cta')}
          </DialogTitle>
        </DialogHeader>

        {/* Step dots */}
        <div className="flex items-center gap-1.5">
          {[1, 2, 3].map((s) => (
            <span
              key={s}
              className={cn('h-1.5 rounded-full transition-all', s === step ? 'w-6 bg-primary' : 'w-3 bg-secondary')}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="min-w-0 space-y-3">
            <p className="text-sm text-muted-foreground">{t('firstPerson.step1Desc')}</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('person.surname')}</label>
                <Input
                  autoFocus
                  value={surname}
                  onChange={(e) => setSurname(e.target.value)}
                  data-testid="first-person-surname"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('person.givenName')}</label>
                <Input value={givenName} onChange={(e) => setGivenName(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2">
              {sexBtn('M', t('sex.male'))}
              {sexBtn('F', t('sex.female'))}
              {sexBtn('U', t('sex.unknown'))}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => close(false)}>
                {t('firstPerson.cancel')}
              </Button>
              <Button disabled={!nameOk} onClick={() => setStep(2)} data-testid="first-person-next">
                {t('firstPerson.next')}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="min-w-0 space-y-3">
            <p className="text-sm text-muted-foreground">{t('firstPerson.step2Desc')}</p>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('firstPerson.birthDate')}
              </label>
              <DateInput value={birthDate} onValueChange={setBirthDate} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('firstPerson.birthPlace')}
              </label>
              <PlaceInput value={birthPlace} onChange={setBirthPlace} />
            </div>
            <div className="flex justify-between gap-2 pt-1">
              <Button variant="ghost" onClick={() => setStep(1)}>
                {t('firstPerson.back')}
              </Button>
              <Button disabled={busy} onClick={() => void create()} data-testid="first-person-create">
                {busy ? '…' : t('firstPerson.create')}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && created && (
          <div className="min-w-0 space-y-3">
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {t('firstPerson.doneTitle')}
            </p>
            <div className="flex items-center gap-2.5 rounded-xl border border-border bg-secondary/40 p-3">
              <UserRound className="h-5 w-5 shrink-0 text-primary" />
              <p className="min-w-0 truncate text-sm font-semibold">
                {`${created.givenName} ${created.surname}`.trim()}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">{t('firstPerson.doneBody')}</p>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => close(false)}>
                {t('firstPerson.finish')}
              </Button>
              <Button
                onClick={() => {
                  useAppStore.getState().openProfile(created.id)
                  close(false)
                }}
                data-testid="first-person-profile"
              >
                {t('firstPerson.openProfile')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
