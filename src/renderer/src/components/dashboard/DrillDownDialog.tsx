import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { PersonAvatar } from '@/components/common/PersonAvatar'
import { fullName, yearOf } from '@/lib/utils'
import { norm } from '@/lib/nameMatch'
import type { Person } from '@shared/types'

/** Lists every person behind a clicked dashboard card / bar / slice, searchable
 *  and each row clickable to open that person. */
export function DrillDownDialog({
  open,
  title,
  people,
  onOpenChange,
  onSelect
}: {
  open: boolean
  title: string
  people: Person[]
  onOpenChange: (v: boolean) => void
  onSelect: (id: string) => void
}): JSX.Element {
  const { t } = useTranslation()
  const [q, setQ] = useState('')

  const sorted = useMemo(
    () =>
      [...people].sort(
        (a, b) => (Number(yearOf(a.birthDate)) || 9999) - (Number(yearOf(b.birthDate)) || 9999)
      ),
    [people]
  )
  const filtered = useMemo(() => {
    const nq = norm(q)
    if (!nq) return sorted
    return sorted.filter(
      (p) => norm(fullName(p)).includes(nq) || norm(p.birthPlace ?? '').includes(nq)
    )
  }, [sorted, q])

  // A card can stand behind hundreds of thousands of people — rendering every
  // row would freeze the dialog. Cap the DOM and tell the user to narrow down.
  const CAP = 300
  const shown = filtered.length > CAP ? filtered.slice(0, CAP) : filtered
  const hidden = filtered.length - shown.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] max-w-lg flex-col">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{title}</DialogTitle>
          <p className="text-xs text-muted-foreground">{t('dashboard.drill.count', { count: people.length })}</p>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('common.search')}
            className="h-9 pl-8"
          />
        </div>

        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {shown.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                onOpenChange(false)
                onSelect(p.id)
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-accent"
            >
              <PersonAvatar personId={p.id} name={fullName(p)} sex={p.sex} className="h-8 w-8 shrink-0 text-[10px]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{fullName(p)}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {yearOf(p.birthDate)}
                  {p.deathDate ? `–${yearOf(p.deathDate)}` : ''}
                  {p.birthPlace ? ` · ${p.birthPlace}` : ''}
                </p>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('dashboard.drill.none')}</p>
          )}
          {hidden > 0 && (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              {t('dashboard.drill.more', { count: hidden })}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
