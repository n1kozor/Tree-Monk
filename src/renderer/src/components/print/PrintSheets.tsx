import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Printer, X } from 'lucide-react'
import type { EventRecord, Family, Occupation, Person } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import { formatName, yearOf } from '@/lib/utils'
import { useDateFormat } from '@/hooks/useDateFormat'

/* ------------------------------------------------------------------ helpers */

const nameOf = (p?: Person | null): string =>
  p ? formatName(p.givenName, p.surname) || '—' : '—'

const lifespan = (p?: Person | null): string => {
  if (!p) return ''
  const b = yearOf(p.birthDate)
  const d = yearOf(p.deathDate)
  if (!b && !d) return p.deceased ? '† ?' : ''
  return `${b || '?'}–${d || (p.deceased ? '?' : '')}`
}

function useRelatives(personId: string): {
  person?: Person
  father?: Person
  mother?: Person
  unions: { spouse?: Person; family: Family; children: Person[] }[]
} {
  const people = useAppStore((s) => s.people)
  const families = useAppStore((s) => s.families)
  return useMemo(() => {
    const byId = new Map(people.map((p) => [p.id, p]))
    const person = byId.get(personId)
    // Parents: the family where this person is a child.
    const asChild = families.find((f) => f.childIds.includes(personId))
    const father = asChild?.husbandId ? byId.get(asChild.husbandId) : undefined
    const mother = asChild?.wifeId ? byId.get(asChild.wifeId) : undefined
    // Unions: families where this person is a parent.
    const unions = families
      .filter((f) => f.husbandId === personId || f.wifeId === personId)
      .map((family) => {
        const spouseId = family.husbandId === personId ? family.wifeId : family.husbandId
        return {
          spouse: spouseId ? byId.get(spouseId) : undefined,
          family,
          children: family.childIds.map((c) => byId.get(c)).filter((x): x is Person => !!x)
        }
      })
    return { person, father, mother, unions }
  }, [people, families, personId])
}

/* ----------------------------------------------------------- sheet chrome */

function SheetShell({
  onClose,
  children
}: {
  onClose: () => void
  children: React.ReactNode
}): JSX.Element {
  const { t } = useTranslation()
  const doPrint = (): void => {
    document.body.classList.add('printing')
    window.print()
    document.body.classList.remove('printing')
  }
  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-auto bg-black/60 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div
        className="print-area relative mx-auto w-full max-w-[820px] overflow-hidden rounded-xl bg-white text-[13px] leading-relaxed text-black shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toolbar INSIDE the sheet card — stays with the modal, not printed. */}
        <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-gray-200 bg-white/95 px-6 py-3 backdrop-blur">
          <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">TreeMonk</span>
          <div className="flex items-center gap-2">
            <button
              onClick={doPrint}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              <Printer className="h-4 w-4" /> {t('print.print')}
            </button>
            <button
              onClick={onClose}
              className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              <X className="h-4 w-4" /> {t('common.close')}
            </button>
          </div>
        </div>
        <div className="p-10">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value?: string | null }): JSX.Element | null {
  if (!value) return null
  return (
    <div className="flex gap-2 py-0.5">
      <span className="w-40 shrink-0 font-semibold text-gray-600">{label}</span>
      <span>{value}</span>
    </div>
  )
}

/* --------------------------------------------------------- person sheet */

export function PersonSheetDialog({
  personId,
  onClose
}: {
  personId: string
  onClose: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const fmtDate = useDateFormat()
  const { person, father, mother, unions } = useRelatives(personId)
  const [occupations, setOccupations] = useState<Occupation[]>([])
  const [events, setEvents] = useState<EventRecord[]>([])

  useEffect(() => {
    void window.api.occupations.listForPerson(personId).then(setOccupations)
    void window.api.events?.forPerson(personId).then(setEvents)
  }, [personId])

  if (!person) return <SheetShell onClose={onClose}>—</SheetShell>

  const sex = person.sex === 'M' ? t('sex.male') : person.sex === 'F' ? t('sex.female') : t('sex.unknown')
  const vital = (d?: string | null, p?: string | null): string =>
    [fmtDate(d), p].filter(Boolean).join(' · ')

  return (
    <SheetShell onClose={onClose}>
      <header className="mb-4 border-b-2 border-gray-800 pb-2">
        <div className="text-xs uppercase tracking-widest text-gray-500">{t('print.personSheet')}</div>
        <h1 className="text-2xl font-bold">{nameOf(person)}</h1>
        {lifespan(person) && <div className="text-gray-600">{lifespan(person)}</div>}
      </header>

      <section className="mb-4">
        <h2 className="mb-1 text-sm font-bold uppercase text-gray-700">{t('print.vitals')}</h2>
        <Field label={t('person.sex')} value={sex} />
        <Field label={t('person.birth')} value={vital(person.birthDate, person.birthPlace)} />
        <Field label={t('person.christening')} value={vital(person.christeningDate, person.christeningPlace)} />
        <Field label={t('person.death')} value={vital(person.deathDate, person.deathPlace)} />
        <Field label={t('person.burial')} value={vital(person.burialDate, person.burialPlace)} />
        <Field label={t('person.religion')} value={person.religion} />
      </section>

      <section className="mb-4">
        <h2 className="mb-1 text-sm font-bold uppercase text-gray-700">{t('print.parents')}</h2>
        <Field label={t('relation.father')} value={father ? `${nameOf(father)} (${lifespan(father)})` : undefined} />
        <Field label={t('relation.mother')} value={mother ? `${nameOf(mother)} (${lifespan(mother)})` : undefined} />
      </section>

      {unions.map((u, i) => (
        <section key={i} className="mb-4">
          <h2 className="mb-1 text-sm font-bold uppercase text-gray-700">
            {t('print.union')} {unions.length > 1 ? i + 1 : ''}
          </h2>
          <Field label={t('relation.spouse')} value={u.spouse ? `${nameOf(u.spouse)} (${lifespan(u.spouse)})` : undefined} />
          <Field label={t('person.marriage')} value={vital(u.family.marriageDate, u.family.marriagePlace)} />
          {u.children.length > 0 && (
            <div className="mt-1">
              <div className="w-40 font-semibold text-gray-600">{t('print.children')}</div>
              <ol className="ml-6 list-decimal">
                {u.children.map((c) => (
                  <li key={c.id}>
                    {nameOf(c)} {lifespan(c) && <span className="text-gray-500">({lifespan(c)})</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      ))}

      {occupations.length > 0 && (
        <section className="mb-4">
          <h2 className="mb-1 text-sm font-bold uppercase text-gray-700">{t('person.occupation')}</h2>
          <ul className="ml-6 list-disc">
            {occupations.map((o) => (
              <li key={o.id}>
                {o.title}
                {(o.startDate || o.endDate) && (
                  <span className="text-gray-500">
                    {' '}
                    ({[o.startDate, o.endDate].map(fmtDate).filter(Boolean).join('–')})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {events.length > 0 && (
        <section className="mb-4">
          <h2 className="mb-1 text-sm font-bold uppercase text-gray-700">{t('print.events')}</h2>
          <ul className="ml-6 list-disc">
            {events.map((e) => (
              <li key={e.id}>
                {e.type}
                {(e.date || e.place) && <span className="text-gray-500"> — {[fmtDate(e.date), e.place].filter(Boolean).join(', ')}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {person.notes && (
        <section className="mb-4">
          <h2 className="mb-1 text-sm font-bold uppercase text-gray-700">{t('person.notes')}</h2>
          <p className="whitespace-pre-wrap">{person.notes}</p>
        </section>
      )}

      <footer className="mt-6 border-t border-gray-300 pt-2 text-[10px] text-gray-400">TreeMonk</footer>
    </SheetShell>
  )
}

/* --------------------------------------------------------- family sheet */

export function FamilySheetDialog({
  personId,
  onClose
}: {
  personId: string
  onClose: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const fmtDate = useDateFormat()
  const { person, unions } = useRelatives(personId)
  // Use the first union as the family group (the common case).
  const union = unions[0]

  const personCol = (p?: Person, label?: string): JSX.Element => (
    <div className="flex-1 border border-gray-300 p-3">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-lg font-bold">{nameOf(p)}</div>
      <div className="mt-1 text-xs text-gray-600">
        {[p?.birthDate && `* ${fmtDate(p.birthDate)}`, p?.birthPlace, p?.deathDate && `† ${fmtDate(p.deathDate)}`]
          .filter(Boolean)
          .join(' · ')}
      </div>
    </div>
  )

  return (
    <SheetShell onClose={onClose}>
      <header className="mb-4 border-b-2 border-gray-800 pb-2">
        <div className="text-xs uppercase tracking-widest text-gray-500">{t('print.familySheet')}</div>
        <h1 className="text-2xl font-bold">{nameOf(person)}</h1>
      </header>

      {!union ? (
        <p className="text-gray-500">{t('print.noFamily')}</p>
      ) : (
        <>
          <div className="mb-3 flex gap-3">
            {personCol(person?.sex === 'F' ? union.spouse : person, t('relation.husband'))}
            {personCol(person?.sex === 'F' ? person : union.spouse, t('relation.wife'))}
          </div>
          {(union.family.marriageDate || union.family.marriagePlace) && (
            <div className="mb-3 text-sm">
              <span className="font-semibold text-gray-600">{t('person.marriage')}: </span>
              {[fmtDate(union.family.marriageDate), union.family.marriagePlace].filter(Boolean).join(' · ')}
            </div>
          )}

          <h2 className="mb-1 text-sm font-bold uppercase text-gray-700">{t('print.children')}</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-400 text-left text-xs uppercase text-gray-500">
                <th className="py-1">#</th>
                <th className="py-1">{t('person.name')}</th>
                <th className="py-1">{t('person.birth')}</th>
                <th className="py-1">{t('person.death')}</th>
              </tr>
            </thead>
            <tbody>
              {union.children.map((c, i) => (
                <tr key={c.id} className="border-b border-gray-200">
                  <td className="py-1">{i + 1}</td>
                  <td className="py-1">{nameOf(c)}</td>
                  <td className="py-1">{[fmtDate(c.birthDate), c.birthPlace].filter(Boolean).join(', ')}</td>
                  <td className="py-1">{[fmtDate(c.deathDate), c.deathPlace].filter(Boolean).join(', ')}</td>
                </tr>
              ))}
              {union.children.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-2 text-center text-gray-400">
                    —
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}

      <footer className="mt-6 border-t border-gray-300 pt-2 text-[10px] text-gray-400">TreeMonk</footer>
    </SheetShell>
  )
}
