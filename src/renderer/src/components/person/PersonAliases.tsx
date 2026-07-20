import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Tag, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store/useAppStore'
import { formatName } from '@/lib/utils'
import type { Alias } from '@shared/types'

/** Canonical name-variant kinds (stored as tokens, translated for display;
 *  GEDCOM writes them as NAME/TYPE and the import maps common values back). */
const ALIAS_KINDS = ['married', 'birth', 'aka', 'nickname', 'religious'] as const

/** Translated label for a kind: canonical tokens localize, anything else
 *  (imported free-text TYPEs) shows raw. */
export function aliasKindLabel(t: (k: string) => string, kind: string | null): string {
  if (!kind) return ''
  const key = `aliases.kind.${kind.toLowerCase()}`
  const label = t(key)
  return label === key ? kind : label
}

/**
 * A quiet one-liner for the profile header: the person's married and/or birth
 * (maiden) name pulled from their typed name variants. Renders nothing when
 * neither is recorded.
 */
export function NameOriginLine({ personId }: { personId: string }): JSX.Element | null {
  const { t } = useTranslation()
  const [list, setList] = useState<Alias[]>([])
  const aliasSignal = useAppStore((s) => s.aliases)

  useEffect(() => {
    let alive = true
    void window.api.aliases.listForPerson(personId).then((r) => alive && setList(r))
    return () => {
      alive = false
    }
  }, [personId, aliasSignal])

  const named = (kind: string): Alias | undefined =>
    list.find((a) => (a.kind ?? '').toLowerCase() === kind)
  const married = named('married')
  const birth = named('birth')
  if (!married && !birth) return null

  const parts: string[] = []
  if (birth) parts.push(t('aliases.neeLine', { name: formatName(birth.givenName, birth.surname) }))
  if (married) parts.push(t('aliases.marriedLine', { name: formatName(married.givenName, married.surname) }))
  return <p className="mt-0.5 text-sm text-muted-foreground">{parts.join(' · ')}</p>
}

/** "Also known as" — manage a person's alias / name-variant names, each with an
 *  optional TYPE (married name, birth name, nickname…). */
export function PersonAliases({ personId }: { personId: string }): JSX.Element {
  const { t, i18n } = useTranslation()
  const refreshAliases = useAppStore((s) => s.refreshAliases)
  const [list, setList] = useState<Alias[]>([])
  const [given, setGiven] = useState('')
  const [surname, setSurname] = useState('')
  const [kind, setKind] = useState('')

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
    await window.api.aliases.create(personId, {
      givenName: given.trim(),
      surname: surname.trim(),
      kind: kind || null
    })
    setGiven('')
    setSurname('')
    setKind('')
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
              {a.kind && (
                <span className="rounded bg-primary/10 px-1 py-px text-[10px] font-medium uppercase tracking-wide text-primary">
                  {aliasKindLabel(t, a.kind)}
                </span>
              )}
              {formatName(a.givenName, a.surname) || '—'}
              <button onClick={() => remove(a.id)} className="rounded-full p-0.5 text-muted-foreground hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        {/* What KIND of name this is — married, birth (maiden), nickname… */}
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          title={t('aliases.kindLabel')}
          className="h-8 w-24 shrink-0 rounded-lg border border-input bg-background px-1 text-xs text-foreground outline-none focus:border-primary"
        >
          <option value="">{t('aliases.kind.plain')}</option>
          {ALIAS_KINDS.map((k) => (
            <option key={k} value={k}>
              {aliasKindLabel(t, k)}
            </option>
          ))}
        </select>
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
