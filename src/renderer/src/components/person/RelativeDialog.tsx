import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link2, UserPlus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateInput } from '@/components/common/DateInput'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { normalizeDate } from '@/lib/dates'
import { ExistingPersonPicker } from '@/components/common/ExistingPersonPicker'
import type { Sex } from '@shared/types'

export interface RelativeDraft {
  givenName: string
  surname: string
  sex: Sex
  birthDate: string | null
  /** Only set when the dialog collects a marriage (spouse mode). */
  marriageDate?: string | null
  marriagePlace?: string | null
}

/** Marriage details collected when attaching/adding a spouse. */
export interface MarriageDraft {
  date: string | null
  place: string | null
}

/**
 * Modal collecting a new relative's details before creating them — or, in the
 * "attach existing" tab, linking an EXISTING person instead.
 */
export function RelativeDialog({
  open,
  onOpenChange,
  title,
  defaultSurname = '',
  defaultSex = 'U',
  onSubmit,
  onPickExisting,
  excludeIds,
  defaultMode = 'create',
  withMarriage = false
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  defaultSurname?: string
  defaultSex?: Sex
  onSubmit: (draft: RelativeDraft) => void
  /** When provided, an "attach existing person" tab is offered. */
  onPickExisting?: (personId: string, marriage?: MarriageDraft) => void
  /** People to hide from the existing-person picker (self / already linked). */
  excludeIds?: Set<string>
  /** Which tab opens first (e.g. godparents default to picking an existing person). */
  defaultMode?: 'create' | 'existing'
  /** Spouse mode: also collect the marriage date + place. */
  withMarriage?: boolean
}): JSX.Element {
  const { t, i18n } = useTranslation()
  const [mode, setMode] = useState<'create' | 'existing'>(defaultMode)
  const [given, setGiven] = useState('')
  const [surname, setSurname] = useState(defaultSurname)
  const [sex, setSex] = useState<Sex>(defaultSex)
  const [birth, setBirth] = useState('')
  const [marrDate, setMarrDate] = useState('')
  const [marrPlace, setMarrPlace] = useState('')

  useEffect(() => {
    if (open) {
      setMode(defaultMode)
      setGiven('')
      setSurname(defaultSurname)
      setSex(defaultSex)
      setBirth('')
      setMarrDate('')
      setMarrPlace('')
    }
  }, [open, defaultSurname, defaultSex, defaultMode])

  const marriage = (): MarriageDraft => ({ date: normalizeDate(marrDate) || null, place: marrPlace.trim() || null })

  const submit = (): void => {
    const m = marriage()
    onSubmit({
      givenName: given.trim(),
      surname: surname.trim(),
      sex,
      birthDate: normalizeDate(birth) || null,
      ...(withMarriage ? { marriageDate: m.date, marriagePlace: m.place } : {})
    })
    onOpenChange(false)
  }

  const marriageFields = withMarriage ? (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1">
        <Label>{`${t('person.marriage')} · ${t('person.date')}`}</Label>
        <DateInput value={marrDate} placeholder={t('person.dateHint')} onValueChange={setMarrDate} />
      </div>
      <div className="space-y-1">
        <Label>{`${t('person.marriage')} · ${t('person.place')}`}</Label>
        <Input value={marrPlace} onChange={(e) => setMarrPlace(e.target.value)} />
      </div>
    </div>
  ) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {onPickExisting && (
          <div className="flex gap-1 rounded-lg border border-border bg-secondary/40 p-1">
            <button
              type="button"
              onClick={() => setMode('create')}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                mode === 'create' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <UserPlus className="h-3.5 w-3.5" /> {t('addPerson.createNew')}
            </button>
            <button
              type="button"
              onClick={() => setMode('existing')}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                mode === 'existing' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Link2 className="h-3.5 w-3.5" /> {t('addPerson.attachExisting')}
            </button>
          </div>
        )}

        {mode === 'existing' && onPickExisting ? (
          <div className="space-y-3">
            {marriageFields}
            <ExistingPersonPicker
              excludeIds={excludeIds}
              onPick={(p) => {
                onPickExisting(p.id, withMarriage ? marriage() : undefined)
                onOpenChange(false)
              }}
            />
          </div>
        ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            {/* Hungarian writes the family name first; other languages given first. */}
            {(i18n.language === 'hu' ? (['surname', 'given'] as const) : (['given', 'surname'] as const)).map(
              (k, idx) => (
                <div key={k} className="space-y-1">
                  <Label>{t(k === 'surname' ? 'person.surname' : 'person.givenName')}</Label>
                  <Input
                    autoFocus={idx === 0}
                    value={k === 'surname' ? surname : given}
                    onChange={(e) => (k === 'surname' ? setSurname : setGiven)(e.target.value)}
                  />
                </div>
              )
            )}
          </div>
          <div className="space-y-1">
            <Label>{t('person.sex')}</Label>
            <div className="flex gap-1.5">
              {([
                ['M', t('person.male')],
                ['F', t('person.female')],
                ['U', t('common.unknown')]
              ] as [Sex, string][]).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSex(value)}
                  className={cn(
                    'flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
                    sex === value
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border-border text-muted-foreground hover:bg-accent'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label>{`${t('person.birth')} · ${t('person.date')}`}</Label>
            <DateInput
              value={birth}
              placeholder={t('person.dateHint')}
              onValueChange={setBirth}
            />
          </div>
          {marriageFields}
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" size="sm">
              {t('common.add')}
            </Button>
          </DialogFooter>
        </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
