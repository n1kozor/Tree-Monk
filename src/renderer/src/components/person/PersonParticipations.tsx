import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Drama } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { fullName } from '@/lib/utils'
import { useDateFormat } from '@/hooks/useDateFormat'
import type { Participation, Person } from '@shared/types'

/** Known event types get a translated label (same lookup PersonEvents uses). */
function typeLabel(t: (k: string) => string, type: string): string {
  for (const candidate of [type, type.toLowerCase()]) {
    const key = `events.type.${candidate}`
    const label = t(key)
    if (label !== key) return label
  }
  return type
}

/**
 * Read-only reverse view: the events this person PARTICIPATES in with a role
 * (pap, bába, adományozó…) — added on the event's own editor. Renders nothing
 * when there are none, so ordinary profiles stay uncluttered.
 */
export function PersonParticipations({
  personId,
  variant = 'plain'
}: {
  personId: string
  /** 'card' wraps in a standalone glass section (profile page); 'plain' flows inline (side panel). */
  variant?: 'card' | 'plain'
}): JSX.Element | null {
  const { t } = useTranslation()
  const fmtDate = useDateFormat()
  const peopleById = useAppStore((s) => s.peopleById)
  const families = useAppStore((s) => s.families)
  const selectPerson = useAppStore((s) => s.selectPerson)
  const [items, setItems] = useState<Participation[]>([])

  useEffect(() => {
    let alive = true
    window.api.eventParticipants
      .forPerson(personId)
      .then((r) => alive && setItems(r))
      .catch(() => alive && setItems([]))
    return () => {
      alive = false
    }
  }, [personId])

  if (!items.length) return null

  /** The people whose event this is (one for a person, the couple for a family). */
  const ownersOf = (p: Participation): Person[] => {
    if (p.ownerType === 'person') {
      const owner = peopleById.get(p.ownerId)
      return owner ? [owner] : []
    }
    const fam = families.find((f) => f.id === p.ownerId)
    return [fam?.husbandId, fam?.wifeId]
      .map((id) => (id ? peopleById.get(id) : undefined))
      .filter((x): x is Person => !!x)
  }

  return (
    <div className={variant === 'card' ? 'glass space-y-2 rounded-2xl p-4' : 'space-y-2'}>
      <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Drama className="h-3.5 w-3.5" /> {t('participants.participationsTitle')} ({items.length})
      </h4>
      <div className="space-y-1">
        {items.map((p) => {
          const owners = ownersOf(p)
          return (
            <div
              key={`${p.eventId}`}
              className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-lg border border-border/40 bg-secondary/40 px-2.5 py-1 text-xs"
            >
              {p.role && (
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                  {p.role}
                </span>
              )}
              <span className="text-muted-foreground">{typeLabel(t, p.type)}</span>
              {p.date && <span className="tabular-nums text-muted-foreground">· {fmtDate(p.date)}</span>}
              {owners.length > 0 && (
                <span className="min-w-0">
                  ·{' '}
                  {owners.map((o, i) => (
                    <button
                      key={o.id}
                      onClick={() => selectPerson(o.id)}
                      className="font-medium hover:text-primary hover:underline"
                    >
                      {fullName(o)}
                      {i < owners.length - 1 ? ' & ' : ''}
                    </button>
                  ))}
                </span>
              )}
              {p.place && <span className="truncate text-muted-foreground">· {p.place}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
