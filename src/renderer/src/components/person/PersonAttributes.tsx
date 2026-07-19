import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ListPlus, Plus, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { PersonAttribute } from '@shared/types'

/**
 * Free-form attributes of a person (GEDCOM FACT/TYPE): height, DNA haplogroup,
 * service number… — undated facts that aren't life events. Rows edit inline
 * (saved on blur), add via the key+value pair at the bottom.
 */
export function PersonAttributes({ personId }: { personId: string }): JSX.Element {
  const { t } = useTranslation()
  const [list, setList] = useState<PersonAttribute[]>([])
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')

  const load = useCallback(async () => {
    setList(await window.api.attributes.forPerson(personId))
  }, [personId])
  useEffect(() => {
    void load()
  }, [load])

  const add = async (): Promise<void> => {
    if (!key.trim()) return
    await window.api.attributes.create(personId, { key: key.trim(), value: value.trim() || null })
    setKey('')
    setValue('')
    await load()
  }
  const patchRow = (id: string, patch: Partial<PersonAttribute>): void => {
    setList((xs) => xs.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }
  const saveRow = async (a: PersonAttribute): Promise<void> => {
    if (!a.key.trim()) return // an emptied key is not saved; delete instead
    await window.api.attributes.update(a.id, { key: a.key, value: a.value })
  }
  const remove = async (id: string): Promise<void> => {
    await window.api.attributes.remove(id)
    await load()
  }

  return (
    <div className="space-y-2">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <ListPlus className="h-3.5 w-3.5" /> {t('attributes.title')}
      </h4>

      {list.length === 0 && <p className="text-xs text-muted-foreground">{t('attributes.none')}</p>}
      {list.length > 0 && (
        <div className="space-y-1">
          {list.map((a) => (
            <div key={a.id} className="group flex items-center gap-1.5">
              <Input
                value={a.key}
                onChange={(e) => patchRow(a.id, { key: e.target.value })}
                onBlur={() => void saveRow(list.find((x) => x.id === a.id)!)}
                className="h-8 w-2/5 text-xs font-medium"
              />
              <Input
                value={a.value ?? ''}
                onChange={(e) => patchRow(a.id, { value: e.target.value || null })}
                onBlur={() => void saveRow(list.find((x) => x.id === a.id)!)}
                className="h-8 flex-1 text-xs"
              />
              <button
                onClick={() => void remove(a.id)}
                className="rounded-full p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                title={t('common.delete')}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <Input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={t('attributes.key')}
          className="h-8 w-2/5 text-xs"
        />
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('attributes.value')}
          onKeyDown={(e) => e.key === 'Enter' && void add()}
          className="h-8 flex-1 text-xs"
        />
        <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={() => void add()} title={t('attributes.add')}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
