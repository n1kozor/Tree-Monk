import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Tag, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store/useAppStore'
import { formatName } from '@/lib/utils'
import type { Alias } from '@shared/types'

/** "Also known as" — manage a person's alias / linguistic-variant names. */
export function PersonAliases({ personId }: { personId: string }): JSX.Element {
  const { t, i18n } = useTranslation()
  const refreshAliases = useAppStore((s) => s.refreshAliases)
  const [list, setList] = useState<Alias[]>([])
  const [given, setGiven] = useState('')
  const [surname, setSurname] = useState('')

  const load = useCallback(async () => {
    setList(await window.api.aliases.listForPerson(personId))
  }, [personId])
  // Re-fetch when the global aliases slice changes too — e.g. a FamilySearch sync
  // merges new name variants for this person while the panel stays open.
  const aliasSignal = useAppStore((s) => s.aliases)
  useEffect(() => {
    void load()
  }, [load, aliasSignal])

  const add = async (): Promise<void> => {
    if (!given.trim() && !surname.trim()) return
    await window.api.aliases.create(personId, { givenName: given.trim(), surname: surname.trim() })
    setGiven('')
    setSurname('')
    await load()
    await refreshAliases()
  }
  const remove = async (id: string): Promise<void> => {
    await window.api.aliases.remove(id)
    await load()
    await refreshAliases()
  }

  return (
    <div className="space-y-2">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Tag className="h-3.5 w-3.5" /> {t('person.aliases')}
      </h4>
      {list.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {list.map((a) => (
            <span
              key={a.id}
              className="flex items-center gap-1 rounded-full border border-border/40 bg-secondary/40 py-1 pl-2.5 pr-1 text-xs"
            >
              {formatName(a.givenName, a.surname) || '—'}
              <button onClick={() => remove(a.id)} className="rounded-full p-0.5 text-muted-foreground hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        {/* Hungarian writes the family name first; other languages given first. */}
        {(i18n.language === 'hu' ? (['surname', 'given'] as const) : (['given', 'surname'] as const)).map((k) => (
          <Input
            key={k}
            value={k === 'surname' ? surname : given}
            onChange={(e) => (k === 'surname' ? setSurname : setGiven)(e.target.value)}
            placeholder={t(k === 'surname' ? 'person.surname' : 'person.givenName')}
            className="h-8 text-xs"
          />
        ))}
        <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={add} title={t('person.addAlias')}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
