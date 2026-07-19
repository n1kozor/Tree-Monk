import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Handshake, Plus, X } from 'lucide-react'
import type { Person } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import { fullName } from '@/lib/utils'
import { PersonAvatar } from '@/components/common/PersonAvatar'
import { RelativeDialog, type RelativeDraft } from './RelativeDialog'

/** A clickable person chip (avatar + name) with an optional remove button. */
function PersonChip({
  person,
  onOpen,
  onRemove
}: {
  person: Person
  onOpen: () => void
  onRemove?: () => void
}): JSX.Element {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-border/40 bg-card/50 py-0.5 pl-0.5 pr-1 text-xs">
      <button onClick={onOpen} className="flex items-center gap-1.5 rounded-full pr-1 hover:text-primary">
        <PersonAvatar personId={person.id} name={fullName(person)} sex={person.sex} className="h-5 w-5 text-[8px]" />
        <span className="max-w-[12rem] truncate font-medium">{fullName(person)}</span>
      </button>
      {onRemove && (
        <button onClick={onRemove} className="rounded-full p-0.5 text-muted-foreground hover:text-destructive" title="">
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  )
}

/**
 * Witnesses (tanúk) of an owner — christening witnesses of a person
 * (`ownerType="person"`) or marriage witnesses of a family
 * (`ownerType="family"`). Each chip links to the witness; add picks from
 * EXISTING people or creates a new one.
 */
export function PersonWitnesses({
  ownerType,
  ownerId,
  title,
  excludeIds
}: {
  ownerType: 'person' | 'family'
  ownerId: string
  title: string
  /** Extra people the picker should not offer (e.g. the person themselves). */
  excludeIds?: string[]
}): JSX.Element {
  const { t } = useTranslation()
  const peopleById = useAppStore((s) => s.peopleById)
  const selectPerson = useAppStore((s) => s.selectPerson)
  const [witnessIds, setWitnessIds] = useState<string[]>([])
  const [adding, setAdding] = useState(false)

  const reload = useCallback(() => {
    void window.api.witnesses.forOwner(ownerType, ownerId).then(setWitnessIds)
  }, [ownerType, ownerId])
  useEffect(reload, [reload])

  const witnesses = witnessIds.map((id) => peopleById.get(id)).filter((p): p is Person => !!p)

  const addExisting = async (wid: string): Promise<void> => {
    await window.api.witnesses.add(ownerType, ownerId, wid)
    reload()
  }
  // Create a brand-new person, then attach them as a witness.
  const createAndAdd = async (draft: RelativeDraft): Promise<void> => {
    const w = await window.api.people.create(draft)
    await window.api.witnesses.add(ownerType, ownerId, w.id)
    await useAppStore.getState().refreshAll()
    reload()
  }
  const remove = async (wid: string): Promise<void> => {
    await window.api.witnesses.remove(ownerType, ownerId, wid)
    reload()
  }

  const exclude = new Set<string>([...(excludeIds ?? []), ...witnessIds])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Handshake className="h-3.5 w-3.5" /> {title}
        </h4>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 rounded-lg border border-border/40 px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          <Plus className="h-3 w-3" /> {t('witnesses.add')}
        </button>
      </div>

      {witnesses.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('witnesses.none')}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {witnesses.map((w) => (
            <PersonChip key={w.id} person={w} onOpen={() => selectPerson(w.id)} onRemove={() => void remove(w.id)} />
          ))}
        </div>
      )}

      <RelativeDialog
        open={adding}
        onOpenChange={setAdding}
        title={t('witnesses.addTitle')}
        defaultMode="existing"
        excludeIds={exclude}
        onPickExisting={(id) => void addExisting(id)}
        onSubmit={(draft) => void createAndAdd(draft)}
      />
    </div>
  )
}
