import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HeartHandshake, Plus, X } from 'lucide-react'
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
 * Godparents (keresztszülők) of a person — shown on the profile, each linking to
 * that person. Add picks from EXISTING people. Also lists, if any, the people
 * this person is a godparent OF.
 */
export function PersonGodparents({ person }: { person: Person }): JSX.Element {
  const { t } = useTranslation()
  const peopleById = useAppStore((s) => s.peopleById)
  const selectPerson = useAppStore((s) => s.selectPerson)
  const [godparentIds, setGodparentIds] = useState<string[]>([])
  const [godchildIds, setGodchildIds] = useState<string[]>([])
  const [adding, setAdding] = useState(false)

  const reload = useCallback(() => {
    void window.api.godparents.listForPerson(person.id).then(setGodparentIds)
    void window.api.godparents.godchildren(person.id).then(setGodchildIds)
  }, [person.id])

  // Reload after a FamilySearch sync too (godparents merged from "Other
  // Relationships"); the godparent people themselves arrive via refreshPeople.
  const syncNonce = useAppStore((s) => s.personSyncNonce)
  useEffect(reload, [reload, syncNonce])

  const godparents = godparentIds.map((id) => peopleById.get(id)).filter((p): p is Person => !!p)
  const godchildren = godchildIds.map((id) => peopleById.get(id)).filter((p): p is Person => !!p)

  const addExisting = async (gid: string): Promise<void> => {
    await window.api.godparents.add(person.id, gid)
    reload()
  }
  // Create a brand-new person, then attach them as a godparent.
  const createAndAdd = async (draft: RelativeDraft): Promise<void> => {
    const g = await window.api.people.create(draft)
    await window.api.godparents.add(person.id, g.id)
    await useAppStore.getState().refreshAll()
    reload()
  }
  const remove = async (gid: string): Promise<void> => {
    await window.api.godparents.remove(person.id, gid)
    reload()
  }

  const exclude = new Set<string>([person.id, ...godparentIds])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <HeartHandshake className="h-3.5 w-3.5" /> {t('godparents.title')}
        </h4>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 rounded-lg border border-border/40 px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          <Plus className="h-3 w-3" /> {t('godparents.add')}
        </button>
      </div>

      {godparents.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('godparents.none')}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {godparents.map((g) => (
            <PersonChip key={g.id} person={g} onOpen={() => selectPerson(g.id)} onRemove={() => void remove(g.id)} />
          ))}
        </div>
      )}

      {godchildren.length > 0 && (
        <div className="space-y-1 pt-1">
          <p className="text-[11px] font-medium text-muted-foreground">{t('godparents.godchildOf')}</p>
          <div className="flex flex-wrap gap-1.5">
            {godchildren.map((g) => (
              <PersonChip key={g.id} person={g} onOpen={() => selectPerson(g.id)} />
            ))}
          </div>
        </div>
      )}

      <RelativeDialog
        open={adding}
        onOpenChange={setAdding}
        title={t('godparents.addTitle')}
        defaultMode="existing"
        excludeIds={exclude}
        onPickExisting={(id) => void addExisting(id)}
        onSubmit={(draft) => void createAndAdd(draft)}
      />
    </div>
  )
}
