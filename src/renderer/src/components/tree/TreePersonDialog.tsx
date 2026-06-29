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
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { ExistingPersonPicker } from '@/components/common/ExistingPersonPicker'
import type { Sex } from '@shared/types'

export interface PersonDraft {
  givenName: string
  surname: string
  sex: Sex
}

/**
 * Quick "add a person" modal used from the pedigree cards. Two modes: create a
 * NEW person (type a name now, flesh out later), or ATTACH an EXISTING person
 * from the tree. Optionally locks the sex (e.g. Add Father).
 */
export function TreePersonDialog({
  open,
  onOpenChange,
  title,
  initial,
  lockSex,
  onSubmit,
  onPickExisting,
  excludeIds
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  initial: PersonDraft
  /** When true the sex is fixed (father/mother) and the selector is hidden. */
  lockSex?: boolean
  onSubmit: (draft: PersonDraft) => void
  /** When provided, an "attach existing person" tab is offered. */
  onPickExisting?: (personId: string) => void
  /** People to hide from the existing-person picker (self / already linked). */
  excludeIds?: Set<string>
}): JSX.Element {
  const { t, i18n } = useTranslation()
  const [mode, setMode] = useState<'create' | 'existing'>('create')
  const [given, setGiven] = useState(initial.givenName)
  const [surname, setSurname] = useState(initial.surname)
  const [sex, setSex] = useState<Sex>(initial.sex)

  useEffect(() => {
    if (open) {
      setMode('create')
      setGiven(initial.givenName)
      setSurname(initial.surname)
      setSex(initial.sex)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const canSubmit = !!(given.trim() || surname.trim())

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
          <ExistingPersonPicker
            excludeIds={excludeIds}
            onPick={(p) => {
              onPickExisting(p.id)
              onOpenChange(false)
            }}
          />
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!canSubmit) return
              onSubmit({ givenName: given.trim(), surname: surname.trim(), sex })
              onOpenChange(false)
            }}
            className="space-y-3"
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

            {!lockSex && (
              <div className="space-y-1">
                <Label>{t('person.sex')}</Label>
                <div className="flex gap-1.5">
                  {(['M', 'F', 'U'] as Sex[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSex(s)}
                      className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                        sex === s ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:bg-accent'
                      }`}
                    >
                      {s === 'M' ? t('person.male') : s === 'F' ? t('person.female') : t('common.unknown')}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" size="sm" disabled={!canSubmit}>
                {t('common.add')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
