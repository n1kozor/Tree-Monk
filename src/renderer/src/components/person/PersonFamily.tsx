import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Baby, Unlink2, Check, Heart, Pencil, UserPlus, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateInput } from '@/components/common/DateInput'
import { useDatePlaceholder } from '@/hooks/useDateFormat'
import { PlaceInput } from '@/components/common/PlaceInput'
import { PersonAvatar } from '@/components/common/PersonAvatar'
import { ConfirmDialog, toastUndo } from '@/components/common/ConfirmDialog'
import { cn, fullName, yearOf } from '@/lib/utils'
import { dateSortKey } from '@/lib/dates'
import { useAppStore } from '@/store/useAppStore'
import { RelativeDialog, type MarriageDraft, type RelativeDraft } from './RelativeDialog'
import { PersonWitnesses } from './PersonWitnesses'
import { FamilyEvents } from './PersonEvents'
import type { ChildRelation, Family, Person, Sex } from '@shared/types'

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

/** Child↔ONE-parent relationship type (PEDI / _FREL/_MREL): birth (default) /
 *  adopted / foster / step. Quiet when birth; amber when it carries information. */
function RelationSelect({
  family,
  childId,
  side
}: {
  family: Family
  childId: string
  side: 'father' | 'mother'
}): JSX.Element {
  const { t } = useTranslation()
  const refreshFamilies = useAppStore((s) => s.refreshFamilies)
  const value = family.childRelations?.[childId]?.[side] ?? ''
  const parentLabel = t(side === 'father' ? 'relation.father' : 'relation.mother')
  return (
    <label
      className="flex shrink-0 items-center gap-0.5"
      onClick={(e) => e.stopPropagation()}
      title={`${t('childRelation.title')} — ${parentLabel}`}
    >
      <span className="text-[9px] font-medium uppercase text-muted-foreground/60">{parentLabel}</span>
      <select
        value={value}
        onChange={async (e) => {
          await window.api.families.setChildRelation(
            family.id,
            childId,
            side,
            (e.target.value || null) as ChildRelation | null
          )
          await refreshFamilies()
        }}
        className={cn(
          'h-6 rounded-md border bg-background px-1 text-[10px] outline-none focus:border-primary',
          value
            ? 'border-amber-500/50 font-medium text-amber-600 dark:text-amber-400'
            : 'border-border/40 text-muted-foreground/70'
        )}
      >
        {/* PARENT-perspective labels — the select sits next to "Apa"/"Anya",
            so the father is the ADOPTIVE one, not the adopted one. */}
        <option value="">{t('parentRelation.birth')}</option>
        <option value="adopted">{t('parentRelation.adopted')}</option>
        <option value="foster">{t('parentRelation.foster')}</option>
        <option value="step">{t('parentRelation.step')}</option>
      </select>
    </label>
  )
}

/**
 * Quiet by default: birth children show only a tiny edit affordance; a
 * non-birth relation shows as an amber badge. Clicking either expands the
 * per-parent selects inline (father first), collapsible again with ✓.
 */
function ChildRelationControls({ family, childId }: { family: Family; childId: string }): JSX.Element | null {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  if (!family.husbandId && !family.wifeId) return null
  const pair = family.childRelations?.[childId]
  const badges: { side: 'father' | 'mother'; v: ChildRelation }[] = []
  if (family.husbandId && pair?.father) badges.push({ side: 'father', v: pair.father })
  if (family.wifeId && pair?.mother) badges.push({ side: 'mother', v: pair.mother })

  if (!open) {
    return (
      <span className="group/rel flex shrink-0 items-center gap-1">
        {badges.map((b) => (
          <button
            key={b.side}
            onClick={(e) => {
              e.stopPropagation()
              setOpen(true)
            }}
            title={t('childRelation.title')}
            className="rounded-md border border-amber-500/50 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"
          >
            {t(`parentRelation.${b.v}`)} · {t(b.side === 'father' ? 'relation.father' : 'relation.mother')}
          </button>
        ))}
        <button
          onClick={(e) => {
            e.stopPropagation()
            setOpen(true)
          }}
          title={t('childRelation.title')}
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/40 transition-all hover:bg-accent hover:text-foreground',
            badges.length === 0 && 'opacity-0 group-hover/rel:opacity-100 focus:opacity-100'
          )}
        >
          <Pencil className="h-3 w-3" />
        </button>
      </span>
    )
  }
  return (
    <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
      {family.husbandId && <RelationSelect family={family} childId={childId} side="father" />}
      {family.wifeId && <RelationSelect family={family} childId={childId} side="mother" />}
      <button
        onClick={(e) => {
          e.stopPropagation()
          setOpen(false)
        }}
        title={t('common.done')}
        className="flex h-6 w-6 items-center justify-center rounded-md text-primary transition-colors hover:bg-primary/10"
      >
        <Check className="h-3.5 w-3.5" />
      </button>
    </span>
  )
}

/** Inline editor for a union's marriage date + place — set or clear them by hand. */
function MarriageEditor({ family }: { family: Family }): JSX.Element {
  const { t } = useTranslation()
  const datePlaceholder = useDatePlaceholder()
  const refreshFamilies = useAppStore((s) => s.refreshFamilies)
  const [editing, setEditing] = useState(false)
  const [date, setDate] = useState(family.marriageDate ?? '')
  const [place, setPlace] = useState(family.marriagePlace ?? '')
  const [order, setOrder] = useState(family.marriageOrder ? String(family.marriageOrder) : '')
  const [relationship, setRelationship] = useState(family.relationship ?? '')
  const [note, setNote] = useState(family.notes ?? '')
  const [saving, setSaving] = useState(false)

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await window.api.families.update(family.id, {
        marriageDate: date.trim() || null,
        marriagePlace: place.trim() || null,
        marriageOrder: order ? Number(order) : null,
        relationship: (relationship || null) as Family['relationship'],
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
          {/* Which marriage this is for the couple (1st, 2nd, …) — optional. */}
          <select
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            title={t('person.marriageOrderLabel')}
            className="h-7 shrink-0 rounded-lg border border-input bg-background/40 px-1 text-xs outline-none"
          >
            <option value="">—</option>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}.
              </option>
            ))}
          </select>
          <DateInput
            value={date}
            onValueChange={setDate}
            placeholder={datePlaceholder}
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
        <div className="flex items-center gap-1.5">
          {/* The couple's own relationship: marriage (default) / partner / none / other. */}
          <select
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            title={t('relationship.title')}
            className="h-7 shrink-0 rounded-lg border border-input bg-background/40 px-1 text-xs outline-none"
          >
            <option value="">{t('relationship.married')}</option>
            <option value="partner">{t('relationship.partner')}</option>
            <option value="none">{t('relationship.none')}</option>
            <option value="other">{t('relationship.other')}</option>
          </select>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('person.notes')}
            className="h-7 flex-1 text-xs"
            onKeyDown={(e) => e.key === 'Enter' && void save()}
          />
        </div>
      </div>
    )
  }

  const ordinal = family.marriageOrder
    ? t('person.marriageOrdinal', { count: family.marriageOrder, ordinal: true })
    : ''
  const relLabel = family.relationship ? t(`relationship.${family.relationship}`) : ''
  const label = [relLabel, ordinal, family.marriageDate, family.marriagePlace].filter(Boolean).join(' · ')
  // A heart would be ironic on a "no relationship" union — icon follows the type.
  const RelIcon = family.relationship === 'none' ? Unlink2 : family.relationship === 'other' ? Users : Heart
  return (
    <div>
      <button
        onClick={() => {
          setDate(family.marriageDate ?? '')
          setPlace(family.marriagePlace ?? '')
          setOrder(family.marriageOrder ? String(family.marriageOrder) : '')
          setRelationship(family.relationship ?? '')
          setNote(family.notes ?? '')
          setEditing(true)
        }}
        className="group/marr flex w-full items-center gap-1.5 px-2 py-0.5 text-left text-[11px] text-muted-foreground hover:text-primary"
      >
        <RelIcon className="h-3 w-3 shrink-0" />
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
  // Filling the empty partner slot of an EXISTING union (its id) — e.g. after the
  // other spouse was deleted, so a new/existing spouse can be set back onto the
  // family WITHOUT losing the children.
  const [fillSpouseFor, setFillSpouseFor] = useState<string | null>(null)
  // Adding a child with no spouse (a single-parent family).
  const [addingChildLone, setAddingChildLone] = useState(false)
  const [unlinking, setUnlinking] = useState<Family | null>(null)

  // EVERY family the person is a child of — birth + adoptive/foster families.
  const parentFamilies = families.filter((f) => f.childIds.includes(person.id))
  const parentFamily = parentFamilies[0]

  // Order for multiple marriages: the user-set marriage number wins, then the
  // marriage date, then the spouse's birth date — earliest partner first.
  // Full month/day precision (dateSortKey), so same-year events order right.
  const unionSortKey = (f: Family): number => {
    if (f.marriageOrder) return f.marriageOrder
    const marriage = dateSortKey(f.marriageDate, 0)
    if (marriage) return 1000000 + marriage
    const spouseId = f.husbandId === person.id ? f.wifeId : f.husbandId
    const spouse = spouseId ? byId.get(spouseId) : undefined
    return 1000000 + dateSortKey(spouse?.birthDate)
  }
  const unions = families
    .filter((f) => f.husbandId === person.id || f.wifeId === person.id)
    .sort((a, b) => unionSortKey(a) - unionSortKey(b))

  const byBirth = (a: Person, b: Person): number =>
    dateSortKey(a.birthDate) - dateSortKey(b.birthDate)

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

  // Fill a missing parent slot of a family the person is a CHILD of — or add a
  // whole second parent family (e.g. adoptive parents alongside birth parents).
  const [addingParentTo, setAddingParentTo] = useState<{ familyId: string; side: 'husbandId' | 'wifeId' } | null>(
    null
  )
  const fillParent = async (familyId: string, side: 'husbandId' | 'wifeId', pid: string): Promise<void> => {
    await window.api.families.update(familyId, { [side]: pid })
    await refreshFamilies()
  }
  const fillNewParent = async (
    familyId: string,
    side: 'husbandId' | 'wifeId',
    draft: RelativeDraft
  ): Promise<void> => {
    const parent = await window.api.people.create(draft)
    await fillParent(familyId, side, parent.id)
  }
  const addParentPair = async (): Promise<void> => {
    await window.api.families.create({
      husbandId: null,
      wifeId: null,
      childIds: [person.id],
      marriageDate: null,
      marriagePlace: null
    })
    await refreshFamilies()
  }
  // An added-but-never-filled parent pair carries zero information — no
  // parents, only this child, no data. Ghost check for cleanup/removal.
  const isEmptyParentPair = (f: Family): boolean =>
    !f.husbandId &&
    !f.wifeId &&
    f.childIds.length === 1 &&
    f.childIds[0] === person.id &&
    !f.marriageDate &&
    !f.marriagePlace &&
    !f.marriageOrder &&
    !f.relationship &&
    !f.notes
  // Auto-cleanup: leaving the profile (or switching person) silently drops any
  // empty parent pair, so an abandoned "+ Szülőpár" never lingers.
  useEffect(() => {
    return () => {
      const fams = useAppStore.getState().families
      const ghosts = fams.filter(isEmptyParentPair)
      if (ghosts.length === 0) return
      void Promise.all(ghosts.map((g) => window.api.families.remove(g.id))).then(() =>
        useAppStore.getState().refreshFamilies()
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person.id])
  // Remove a parent family from THIS person: an empty pair is deleted outright;
  // a real one only unlinks the child↔parents edge (nobody is deleted).
  const [unlinkingParents, setUnlinkingParents] = useState<Family | null>(null)
  const removeParentFamily = async (pf: Family): Promise<void> => {
    if (isEmptyParentPair(pf)) {
      await window.api.families.remove(pf.id)
    } else {
      await window.api.families.update(pf.id, { childIds: pf.childIds.filter((id) => id !== person.id) })
    }
    await refreshFamilies()
  }

  // Link an existing person (new OR attached) as a child of the family,
  // optionally with a non-birth relation (adopted/foster/step) from the dialog.
  const linkChild = async (
    familyId: string,
    childId: string,
    relation?: ChildRelation | null
  ): Promise<void> => {
    const fam = families.find((f) => f.id === familyId)
    if (fam && !fam.childIds.includes(childId))
      await window.api.families.update(familyId, { childIds: [...fam.childIds, childId] })
    if (relation) await window.api.families.setChildRelation(familyId, childId, 'both', relation)
    await refreshFamilies()
    selectPerson(childId)
  }
  const addChild = async (familyId: string, draft: RelativeDraft): Promise<void> => {
    const child = await window.api.people.create(draft)
    await linkChild(familyId, child.id, draft.relation)
  }

  // Add a child WITHOUT a spouse — creates a single-parent family with this
  // person as the sole parent (the other parent unknown). Otherwise a child
  // could only be added inside an existing union.
  const linkChildLone = async (childId: string, relation?: ChildRelation | null): Promise<void> => {
    const role =
      person.sex === 'F'
        ? { wifeId: person.id, husbandId: null }
        : { husbandId: person.id, wifeId: null }
    const fam = await window.api.families.create({
      ...role,
      childIds: [childId],
      marriageDate: null,
      marriagePlace: null
    })
    if (relation) await window.api.families.setChildRelation(fam.id, childId, 'both', relation)
    await refreshFamilies()
    selectPerson(childId)
  }
  const addChildLone = async (draft: RelativeDraft): Promise<void> => {
    const child = await window.api.people.create(draft)
    await linkChildLone(child.id, draft.relation)
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

  // Set a spouse onto the EMPTY side of an existing union (keeps its children +
  // marriage data). Used when the previous spouse was deleted, leaving a family
  // with one partner and the kids but no way to re-add a spouse to it.
  const fillExistingSpouse = async (
    familyId: string,
    spouseId: string,
    marriage?: MarriageDraft
  ): Promise<void> => {
    const f = families.find((x) => x.id === familyId)
    if (!f) return
    const side: 'husbandId' | 'wifeId' = f.husbandId === person.id ? 'wifeId' : 'husbandId'
    await window.api.families.update(f.id, {
      [side]: spouseId,
      ...(marriage?.date ? { marriageDate: marriage.date } : {}),
      ...(marriage?.place ? { marriagePlace: marriage.place } : {})
    })
    await refreshFamilies()
    selectPerson(spouseId)
  }
  const fillNewSpouse = async (familyId: string, draft: RelativeDraft): Promise<void> => {
    const spouse = await window.api.people.create(draft)
    await fillExistingSpouse(familyId, spouse.id, {
      date: draft.marriageDate ?? null,
      place: draft.marriagePlace ?? null
    })
  }

  // Detach a wrongly-attached spouse WITHOUT deleting the person: only the
  // couple link is cut. Children stay with the current person (single-parent
  // family); a union left with no children and no marriage data is removed
  // entirely so no phantom family lingers. Undo restores the link.
  const unlinkSpouse = async (f: Family): Promise<void> => {
    const spouseSide: 'husbandId' | 'wifeId' = f.husbandId === person.id ? 'wifeId' : 'husbandId'
    const spouseId = f[spouseSide]
    const spouse = spouseId ? byId.get(spouseId) : undefined
    const keepFamily =
      f.childIds.length > 0 || !!f.marriageDate || !!f.marriagePlace || !!f.marriageOrder || !!f.notes
    if (keepFamily) await window.api.families.update(f.id, { [spouseSide]: null })
    else await window.api.families.remove(f.id)
    await refreshFamilies()
    toastUndo(
      t('person.spouseUnlinked', { name: spouse ? fullName(spouse) : t('common.unknown') }),
      t('common.undo'),
      async () => {
        if (keepFamily) await window.api.families.update(f.id, { [spouseSide]: spouseId })
        else
          await window.api.families.create({
            husbandId: f.husbandId,
            wifeId: f.wifeId,
            childIds: f.childIds,
            marriageDate: f.marriageDate,
            marriagePlace: f.marriagePlace,
            marriageOrder: f.marriageOrder,
            notes: f.notes
          })
        await refreshFamilies()
      }
    )
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
      {/* Parents — every family the person is a child of (birth + adoptive…). */}
      {parentFamilies.map((pf, idx) => (
        <section key={pf.id}>
          <div className="mb-1 flex items-center justify-between gap-2">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Users className="h-3.5 w-3.5" /> {t('person.parents')}
              {parentFamilies.length > 1 && (
                <span className="font-normal normal-case tracking-normal text-muted-foreground/80">
                  · {idx + 1}.
                </span>
              )}
            </h4>
            <span className="flex items-center gap-1.5">
              <ChildRelationControls family={pf} childId={person.id} />
              <button
                onClick={() => (isEmptyParentPair(pf) ? void removeParentFamily(pf) : setUnlinkingParents(pf))}
                title={t('person.unlinkParents')}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-destructive/15 hover:text-destructive"
              >
                <Unlink2 className="h-3.5 w-3.5" />
              </button>
            </span>
          </div>
          <div className="rounded-xl border border-border/40 bg-secondary/40">
            {([
              ['husbandId', pf.husbandId, t('person.addFather'), 'M'],
              ['wifeId', pf.wifeId, t('person.addMother'), 'F']
            ] as ['husbandId' | 'wifeId', string | null, string, Sex][]).map(([side, pid, addLabel]) => {
              const parent = pid ? byId.get(pid) : undefined
              return parent ? (
                <PersonRow key={side} p={parent} onClick={() => selectPerson(parent.id)} />
              ) : (
                <button
                  key={side}
                  onClick={() => setAddingParentTo({ familyId: pf.id, side })}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
                >
                  <UserPlus className="h-4 w-4" /> {addLabel}
                </button>
              )
            })}
          </div>
        </section>
      ))}
      {/* A second (adoptive / foster) parent family alongside the first. */}
      {parentFamilies.length > 0 && parentFamilies.length < 3 && (
        <button
          onClick={() => void addParentPair()}
          className="-mt-2 text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
        >
          + {t('person.addParentPair')}
        </button>
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
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setAddingChildLone(true)}
            >
              <Baby className="h-3.5 w-3.5" /> {t('person.addChild')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setAddingSpouse(true)}
            >
              <UserPlus className="h-3.5 w-3.5" /> {t('person.addSpouse')}
            </Button>
          </div>
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
                  <div className="flex items-center gap-1">
                    <div className="min-w-0 flex-1">
                      <PersonRow p={spouse} onClick={() => selectPerson(spouse.id)} />
                    </div>
                    <button
                      onClick={() => setUnlinking(f)}
                      title={t('person.unlinkSpouse')}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-destructive transition-colors hover:bg-destructive/15"
                    >
                      <Unlink2 className="h-5 w-5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setFillSpouseFor(f.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
                  >
                    <UserPlus className="h-4 w-4" /> {t('person.addSpouse')}
                  </button>
                )}
                <MarriageEditor family={f} />
                {/* Marriage witnesses + union events share one row: while empty
                    they are just two quiet chips; with content they grow into
                    full-width blocks. */}
                <div className="mt-1.5 flex flex-wrap items-start gap-1.5 border-t border-border/40 px-2 pt-1.5">
                  <PersonWitnesses
                    ownerType="family"
                    ownerId={f.id}
                    title={t('witnesses.marriageTitle')}
                    excludeIds={[f.husbandId, f.wifeId].filter((x): x is string => !!x)}
                    compact
                  />
                  <FamilyEvents familyId={f.id} compact />
                </div>
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
                    <div key={c.id} className="flex items-center gap-1 pr-2">
                      <div className="min-w-0 flex-1">
                        <PersonRow p={c} onClick={() => selectPerson(c.id)} />
                      </div>
                      <ChildRelationControls family={f} childId={c.id} />
                    </div>
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
        withChildRelation
        onSubmit={(draft) => {
          if (addingChildTo) void addChild(addingChildTo, draft)
        }}
        onPickExisting={(id, _marriage, relation) => {
          if (addingChildTo) void linkChild(addingChildTo, id, relation)
        }}
        excludeIds={addingChildTo ? childExclude(addingChildTo) : undefined}
      />
      {/* Fill a missing parent slot of a parent family. */}
      <RelativeDialog
        open={addingParentTo !== null}
        onOpenChange={(o) => !o && setAddingParentTo(null)}
        title={t(addingParentTo?.side === 'wifeId' ? 'person.addMother' : 'person.addFather')}
        defaultSex={addingParentTo?.side === 'wifeId' ? 'F' : 'M'}
        defaultSurname={addingParentTo?.side === 'wifeId' ? '' : person.surname}
        onSubmit={(draft) => {
          if (addingParentTo) void fillNewParent(addingParentTo.familyId, addingParentTo.side, draft)
        }}
        onPickExisting={(id) => {
          if (addingParentTo) void fillParent(addingParentTo.familyId, addingParentTo.side, id)
        }}
        excludeIds={new Set([person.id])}
      />
      {/* Add a child with no spouse → a single-parent family. */}
      <RelativeDialog
        open={addingChildLone}
        onOpenChange={setAddingChildLone}
        title={t('person.addChildTitle')}
        defaultSurname={person.surname}
        withChildRelation
        onSubmit={(draft) => void addChildLone(draft)}
        onPickExisting={(id, _marriage, relation) => void linkChildLone(id, relation)}
        excludeIds={new Set([person.id])}
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
      {/* Fill the empty partner slot of an existing union (keeps its children). */}
      <RelativeDialog
        open={fillSpouseFor !== null}
        onOpenChange={(o) => !o && setFillSpouseFor(null)}
        title={t('person.addSpouseTitle')}
        defaultSex={person.sex === 'F' ? 'M' : person.sex === 'M' ? 'F' : 'U'}
        withMarriage
        onSubmit={(draft) => {
          if (fillSpouseFor) void fillNewSpouse(fillSpouseFor, draft)
        }}
        onPickExisting={(id, marriage) => {
          if (fillSpouseFor) void fillExistingSpouse(fillSpouseFor, id, marriage)
        }}
        excludeIds={spouseExclude}
      />

      {unlinkingParents && (
        <ConfirmDialog
          open={!!unlinkingParents}
          onOpenChange={(o) => !o && setUnlinkingParents(null)}
          title={t('person.unlinkParentsTitle', { name: fullName(person) })}
          confirmLabel={t('person.unlinkParents')}
          onConfirm={() => {
            const f = unlinkingParents
            setUnlinkingParents(null)
            if (f) void removeParentFamily(f)
          }}
        >
          <p>{t('person.unlinkParentsBody')}</p>
        </ConfirmDialog>
      )}

      {unlinking && (() => {
        const sid = unlinking.husbandId === person.id ? unlinking.wifeId : unlinking.husbandId
        const sp = sid ? byId.get(sid) : undefined
        return (
          <ConfirmDialog
            open={!!unlinking}
            onOpenChange={(o) => !o && setUnlinking(null)}
            title={t('person.unlinkSpouseTitle', { name: sp ? fullName(sp) : t('common.unknown') })}
            confirmLabel={t('person.unlinkSpouse')}
            onConfirm={() => {
              const f = unlinking
              setUnlinking(null)
              if (f) void unlinkSpouse(f)
            }}
          >
            <p>{t('person.unlinkSpouseBody')}</p>
            {unlinking.childIds.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t('person.unlinkSpouseChildren', { count: unlinking.childIds.length })}
              </p>
            )}
          </ConfirmDialog>
        )
      })()}
    </div>
  )
}
