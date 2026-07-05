import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Baby, Check, Heart, Pencil, UserPlus, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateInput } from '@/components/common/DateInput'
import { PlaceInput } from '@/components/common/PlaceInput'
import { PersonAvatar } from '@/components/common/PersonAvatar'
import { fullName, yearOf } from '@/lib/utils'
import { useAppStore } from '@/store/useAppStore'
import { RelativeDialog, type MarriageDraft, type RelativeDraft } from './RelativeDialog'
import type { Family, Person } from '@shared/types'

function PersonRow({ p, onClick }: { p: Person; onClick: () => void }): JSX.Element {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent"
    >
      <PersonAvatar personId={p.id} name={fullName(p)} sex={p.sex} className="h-7 w-7 text-[10px]" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{fullName(p)}</p>
        <p className="text-[11px] text-muted-foreground">
          {yearOf(p.birthDate)}
          {p.deathDate ? `–${yearOf(p.deathDate)}` : ''}
        </p>
      </div>
    </button>
  )
}

/** Inline editor for a union's marriage date + place — set or clear them by hand. */
function MarriageEditor({ family }: { family: Family }): JSX.Element {
  const { t } = useTranslation()
  const refreshFamilies = useAppStore((s) => s.refreshFamilies)
  const [editing, setEditing] = useState(false)
  const [date, setDate] = useState(family.marriageDate ?? '')
  const [place, setPlace] = useState(family.marriagePlace ?? '')
  const [note, setNote] = useState(family.notes ?? '')
  const [saving, setSaving] = useState(false)

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await window.api.families.update(family.id, {
        marriageDate: date.trim() || null,
        marriagePlace: place.trim() || null,
        notes: note.trim() || null
      })
      await refreshFamilies()
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="space-y-1.5 px-2 py-1">
        <div className="flex items-center gap-1.5">
          <DateInput
            value={date}
            onValueChange={setDate}
            placeholder={t('person.dateHint')}
            className="h-7 flex-1 text-xs"
            onKeyDown={(e) => e.key === 'Enter' && void save()}
            autoFocus
          />
          <div className="flex-1">
            <PlaceInput value={place} onChange={setPlace} placeholder={t('person.place')} className="h-7 text-xs" />
          </div>
          <Button size="icon" className="h-7 w-7 shrink-0" disabled={saving} onClick={() => void save()}>
            <Check className="h-3.5 w-3.5" />
          </Button>
        </div>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('person.notes')}
          className="h-7 w-full text-xs"
          onKeyDown={(e) => e.key === 'Enter' && void save()}
        />
      </div>
    )
  }

  const label = [family.marriageDate, family.marriagePlace].filter(Boolean).join(' · ')
  return (
    <div>
      <button
        onClick={() => {
          setDate(family.marriageDate ?? '')
          setPlace(family.marriagePlace ?? '')
          setNote(family.notes ?? '')
          setEditing(true)
        }}
        className="group/marr flex w-full items-center gap-1.5 px-2 py-0.5 text-left text-[11px] text-muted-foreground hover:text-primary"
      >
        <Heart className="h-3 w-3 shrink-0" />
        <span className="truncate">{label || t('person.addMarriage')}</span>
        <Pencil className="h-2.5 w-2.5 shrink-0 opacity-0 group-hover/marr:opacity-100" />
      </button>
      {family.notes && (
        <p className="whitespace-pre-wrap px-2 pb-0.5 pl-[18px] text-[11px] italic text-muted-foreground/90">
          {family.notes}
        </p>
      )}
    </div>
  )
}

export function PersonFamily({ person }: { person: Person }): JSX.Element {
  const { t } = useTranslation()
  const people = useAppStore((s) => s.people)
  const families = useAppStore((s) => s.families)
  const refreshFamilies = useAppStore((s) => s.refreshFamilies)
  const selectPerson = useAppStore((s) => s.selectPerson)
  const byId = new Map(people.map((p) => [p.id, p]))

  // Which add-dialog is open: a child of a given family, or a new spouse.
  const [addingChildTo, setAddingChildTo] = useState<string | null>(null)
  const [addingSpouse, setAddingSpouse] = useState(false)

  const parentFamily = families.find((f) => f.childIds.includes(person.id))

  // Chronological order for multiple marriages: by marriage year, falling back
  // to the spouse's birth year when the union has no marriage date, so the
  // earliest partner is listed first.
  const unionSortKey = (f: Family): number => {
    const marriage = Number(yearOf(f.marriageDate))
    if (marriage) return marriage
    const spouseId = f.husbandId === person.id ? f.wifeId : f.husbandId
    const spouse = spouseId ? byId.get(spouseId) : undefined
    return Number(yearOf(spouse?.birthDate)) || 9999
  }
  const unions = families
    .filter((f) => f.husbandId === person.id || f.wifeId === person.id)
    .sort((a, b) => unionSortKey(a) - unionSortKey(b))

  const byBirth = (a: Person, b: Person): number =>
    (Number(yearOf(a.birthDate)) || 9999) - (Number(yearOf(b.birthDate)) || 9999)

  const parentIds = parentFamily
    ? [parentFamily.husbandId, parentFamily.wifeId].filter((x): x is string => !!x)
    : []

  // Full siblings share BOTH parents → the other children of the very same
  // family that lists this person as a child, oldest first.
  const fullSiblings = parentFamily
    ? parentFamily.childIds
        .filter((id) => id !== person.id)
        .map((id) => byId.get(id))
        .filter((p): p is Person => !!p)
        .sort(byBirth)
    : []

  // Half-siblings come from any *other* family that shares exactly one parent
  // (e.g. a parent's earlier/later marriage). Group them by that family so the
  // differing parent is shown — this disambiguates the family composition.
  type HalfGroup = { family: Family; kids: Person[]; otherParent: Person | undefined }
  const halfSiblingGroups: HalfGroup[] = (
    parentFamily
      ? families
          .filter((f) => f.id !== parentFamily.id)
          .map((f): HalfGroup | null => {
            const sharesHusband = !!f.husbandId && parentIds.includes(f.husbandId)
            const sharesWife = !!f.wifeId && parentIds.includes(f.wifeId)
            if (!sharesHusband && !sharesWife) return null
            const kids = f.childIds
              .filter((id) => id !== person.id)
              .map((id) => byId.get(id))
              .filter((p): p is Person => !!p)
              .sort(byBirth)
            if (kids.length === 0) return null
            // The non-shared parent identifies this branch (often the other mother).
            const otherParentId = sharesHusband ? f.wifeId : f.husbandId
            const otherParent = otherParentId ? byId.get(otherParentId) : undefined
            return { family: f, kids, otherParent }
          })
          .filter((g): g is HalfGroup => !!g)
          .sort((a, b) => byBirth(a.kids[0], b.kids[0]))
      : []
  )

  // Link an existing person (new OR attached) as a child of the family.
  const linkChild = async (familyId: string, childId: string): Promise<void> => {
    const fam = families.find((f) => f.id === familyId)
    if (fam && !fam.childIds.includes(childId))
      await window.api.families.update(familyId, { childIds: [...fam.childIds, childId] })
    await refreshFamilies()
    selectPerson(childId)
  }
  const addChild = async (familyId: string, draft: RelativeDraft): Promise<void> => {
    const child = await window.api.people.create(draft)
    await linkChild(familyId, child.id)
  }

  // Link a person as a new spouse (a fresh union with the proband), optionally
  // with the marriage date + place captured in the dialog.
  const linkSpouse = async (spouseId: string, marriage?: MarriageDraft): Promise<void> => {
    const role =
      person.sex === 'F'
        ? { wifeId: person.id, husbandId: spouseId }
        : { husbandId: person.id, wifeId: spouseId }
    await window.api.families.create({
      ...role,
      childIds: [],
      marriageDate: marriage?.date ?? null,
      marriagePlace: marriage?.place ?? null
    })
    await refreshFamilies()
    selectPerson(spouseId)
  }
  const addSpouse = async (draft: RelativeDraft): Promise<void> => {
    const spouse = await window.api.people.create(draft)
    await linkSpouse(spouse.id, { date: draft.marriageDate ?? null, place: draft.marriagePlace ?? null })
  }

  // Exclusions for the existing-person pickers.
  const childExclude = (familyId: string): Set<string> => {
    const fam = families.find((f) => f.id === familyId)
    const ex = new Set<string>(fam?.childIds ?? [])
    if (fam?.husbandId) ex.add(fam.husbandId)
    if (fam?.wifeId) ex.add(fam.wifeId)
    return ex
  }
  const spouseExclude = ((): Set<string> => {
    const ex = new Set<string>([person.id])
    for (const f of families) {
      if (f.husbandId === person.id && f.wifeId) ex.add(f.wifeId)
      if (f.wifeId === person.id && f.husbandId) ex.add(f.husbandId)
    }
    return ex
  })()

  return (
    <div className="space-y-4">
      {/* Parents */}
      {parentFamily && (
        <section>
          <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> {t('person.parents')}
          </h4>
          <div className="rounded-xl border border-border/40 bg-secondary/40">
            {[parentFamily.husbandId, parentFamily.wifeId]
              .map((id) => (id ? byId.get(id) : undefined))
              .filter((p): p is Person => !!p)
              .map((p) => (
                <PersonRow key={p.id} p={p} onClick={() => selectPerson(p.id)} />
              ))}
          </div>
        </section>
      )}

      {/* Full siblings (children sharing both parents) */}
      {fullSiblings.length > 0 && (
        <section>
          <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> {t('person.siblings')} ({fullSiblings.length})
          </h4>
          <div className="rounded-xl border border-border/40 bg-secondary/40">
            {fullSiblings.map((p) => (
              <PersonRow key={p.id} p={p} onClick={() => selectPerson(p.id)} />
            ))}
          </div>
        </section>
      )}

      {/* Half-siblings, grouped by the differing parent (e.g. the other mother) */}
      {halfSiblingGroups.map(({ family, kids, otherParent }) => (
        <section key={family.id}>
          <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> {t('person.halfSiblings')} ({kids.length})
            <span className="font-normal normal-case tracking-normal text-muted-foreground/80">
              · {otherParent ? fullName(otherParent) : t('common.unknown')}
            </span>
          </h4>
          <div className="rounded-xl border border-border/40 bg-secondary/40">
            {kids.map((p) => (
              <PersonRow key={p.id} p={p} onClick={() => selectPerson(p.id)} />
            ))}
          </div>
        </section>
      ))}

      {/* Unions (spouses + children) */}
      <section>
        <div className="mb-1 flex items-center justify-between">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Heart className="h-3.5 w-3.5" /> {t('person.spouses')}
          </h4>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setAddingSpouse(true)}
          >
            <UserPlus className="h-3.5 w-3.5" /> {t('person.addSpouse')}
          </Button>
        </div>

        {unions.length === 0 && (
          <p className="px-1 py-2 text-xs text-muted-foreground">{t('person.noFamily')}</p>
        )}

        <div className="space-y-3">
          {unions.map((f) => {
            const spouseId = f.husbandId === person.id ? f.wifeId : f.husbandId
            const spouse = spouseId ? byId.get(spouseId) : undefined
            const children = f.childIds.map((id) => byId.get(id)).filter((p): p is Person => !!p)
            return (
              <div key={f.id} className="rounded-xl border border-border/40 bg-secondary/40 p-2">
                {spouse ? (
                  <PersonRow p={spouse} onClick={() => selectPerson(spouse.id)} />
                ) : (
                  <p className="px-2 py-1.5 text-sm text-muted-foreground">{t('common.unknown')}</p>
                )}
                <MarriageEditor family={f} />
                <div className="mt-1.5 border-t border-border/40 pt-1.5">
                  <div className="flex items-center justify-between px-2">
                    <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                      <Baby className="h-3 w-3" /> {t('person.children')} ({children.length})
                    </span>
                    <button
                      onClick={() => setAddingChildTo(f.id)}
                      className="text-[11px] font-medium text-primary hover:underline"
                    >
                      + {t('person.addChild')}
                    </button>
                  </div>
                  {children.map((c) => (
                    <PersonRow key={c.id} p={c} onClick={() => selectPerson(c.id)} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <RelativeDialog
        open={addingChildTo !== null}
        onOpenChange={(o) => !o && setAddingChildTo(null)}
        title={t('person.addChildTitle')}
        defaultSurname={person.surname}
        onSubmit={(draft) => {
          if (addingChildTo) void addChild(addingChildTo, draft)
        }}
        onPickExisting={(id) => {
          if (addingChildTo) void linkChild(addingChildTo, id)
        }}
        excludeIds={addingChildTo ? childExclude(addingChildTo) : undefined}
      />
      <RelativeDialog
        open={addingSpouse}
        onOpenChange={setAddingSpouse}
        title={t('person.addSpouseTitle')}
        defaultSex={person.sex === 'F' ? 'M' : person.sex === 'M' ? 'F' : 'U'}
        withMarriage
        onSubmit={(draft) => void addSpouse(draft)}
        onPickExisting={(id, marriage) => void linkSpouse(id, marriage)}
        excludeIds={spouseExclude}
      />
    </div>
  )
}
