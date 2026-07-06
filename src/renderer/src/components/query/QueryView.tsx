import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import { Bookmark, BookmarkPlus, Check, Play, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { PersonAvatar } from '@/components/common/PersonAvatar'
import { useAppStore } from '@/store/useAppStore'
import { fullName, yearOf } from '@/lib/utils'
import type {
  Person,
  PersonQuery,
  QueryField,
  QueryOperator,
  QueryRule,
  SavedQuery
} from '@shared/types'

const FIELDS: QueryField[] = [
  'surname',
  'givenName',
  'sex',
  'birthPlace',
  'deathPlace',
  'occupation',
  'birthYear',
  'deathYear'
]
const OPERATORS: QueryOperator[] = [
  'contains',
  'notContains',
  'equals',
  'notEquals',
  'startsWith',
  'lt',
  'gt',
  'isEmpty',
  'notEmpty'
]
const NO_VALUE: QueryOperator[] = ['isEmpty', 'notEmpty']

const selectCls =
  'h-9 rounded-xl border border-input bg-background/40 px-2 text-sm outline-none backdrop-blur-sm focus:ring-1 focus:ring-ring'

export function QueryView(): JSX.Element {
  const { t } = useTranslation()
  const selectPerson = useAppStore((s) => s.selectPerson)
  const [combinator, setCombinator] = useState<'AND' | 'OR'>('AND')
  const [rules, setRules] = useState<QueryRule[]>([
    { field: 'surname', operator: 'contains', value: '' }
  ])
  const [results, setResults] = useState<Person[] | null>(null)

  // Saved queries (named, reusable). `activeId` highlights the loaded one; any
  // manual edit detaches from it so the chip no longer looks "current".
  const [saved, setSaved] = useState<SavedQuery[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [naming, setNaming] = useState(false)
  const [draftName, setDraftName] = useState('')

  useEffect(() => {
    void window.api.query.listSaved().then(setSaved)
  }, [])

  const detach = (): void => setActiveId(null)
  const update = (i: number, patch: Partial<QueryRule>): void => {
    setRules((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
    detach()
  }
  const addRule = (): void => {
    setRules((rs) => [...rs, { field: 'birthYear', operator: 'lt', value: '' }])
    detach()
  }
  const removeRule = (i: number): void => {
    setRules((rs) => rs.filter((_, j) => j !== i))
    detach()
  }
  const pickCombinator = (c: 'AND' | 'OR'): void => {
    setCombinator(c)
    detach()
  }

  const runQuery = async (q: PersonQuery): Promise<void> =>
    setResults(await window.api.query.run(q))
  const run = (): Promise<void> => runQuery({ combinator, rules })

  const loadSaved = (q: SavedQuery): void => {
    setCombinator(q.query.combinator)
    setRules(q.query.rules.map((r) => ({ ...r })))
    setActiveId(q.id)
    void runQuery(q.query)
  }

  const startSave = (): void => {
    setDraftName(saved.find((s) => s.id === activeId)?.name ?? '')
    setNaming(true)
  }
  const confirmSave = async (): Promise<void> => {
    const name = draftName.trim()
    if (!name) return
    const list = await window.api.query.save(name, { combinator, rules })
    setSaved(list)
    setActiveId(list.find((s) => s.name.trim().toLowerCase() === name.toLowerCase())?.id ?? null)
    setNaming(false)
    setDraftName('')
    toast.success(t('query.savedToast', { name }))
  }
  const deleteSaved = async (id: string, e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    const list = await window.api.query.remove(id)
    setSaved(list)
    if (activeId === id) setActiveId(null)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Builder */}
      <div className="border-b border-border/40 p-4">
        {/* Saved-query chips */}
        {saved.length > 0 && (
          <div className="mb-3 flex items-start gap-2">
            <Bookmark className="mt-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="flex flex-wrap gap-1.5">
              <AnimatePresence initial={false}>
                {saved.map((q) => (
                  <motion.button
                    key={q.id}
                    layout
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.15 }}
                    onClick={() => loadSaved(q)}
                    title={q.name}
                    className={cn(
                      'group flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                      activeId === q.id
                        ? 'border-primary/40 bg-primary/15 text-primary shadow-[inset_0_1px_0_hsl(var(--glass-highlight)/0.4)] ring-1 ring-primary/20'
                        : 'border-border/40 bg-secondary/40 backdrop-blur-sm hover:bg-accent'
                    )}
                  >
                    <Bookmark className={cn('h-3 w-3 shrink-0', activeId === q.id && 'fill-current')} />
                    <span className="max-w-[180px] truncate">{q.name}</span>
                    <span
                      role="button"
                      tabIndex={-1}
                      onClick={(e) => deleteSaved(q.id, e)}
                      title={t('common.delete')}
                      className="-mr-1 ml-0.5 rounded-full p-0.5 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </span>
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}

        <div className="mb-3 flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl bg-secondary/40 p-0.5 backdrop-blur-sm">
            {(['AND', 'OR'] as const).map((c) => (
              <button
                key={c}
                onClick={() => pickCombinator(c)}
                className={cn(
                  'rounded-lg px-3 py-1 text-xs font-semibold transition-colors',
                  combinator === c
                    ? 'bg-background text-foreground shadow-[inset_0_1px_0_hsl(var(--glass-highlight)/0.4)] ring-1 ring-primary/20'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t(`query.${c.toLowerCase()}`)}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">{t('query.combinatorHint')}</span>
        </div>

        <div className="space-y-2">
          {rules.map((rule, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-10 text-right text-[11px] font-medium uppercase text-muted-foreground">
                {i === 0 ? t('query.where') : t(`query.${combinator.toLowerCase()}`)}
              </span>
              <select
                value={rule.field}
                onChange={(e) => update(i, { field: e.target.value as QueryField })}
                className={selectCls}
              >
                {FIELDS.map((f) => (
                  <option key={f} value={f}>
                    {t(`query.fields.${f}`)}
                  </option>
                ))}
              </select>
              <select
                value={rule.operator}
                onChange={(e) => update(i, { operator: e.target.value as QueryOperator })}
                className={selectCls}
              >
                {OPERATORS.map((o) => (
                  <option key={o} value={o}>
                    {t(`query.ops.${o}`)}
                  </option>
                ))}
              </select>
              {!NO_VALUE.includes(rule.operator) && (
                <Input
                  value={rule.value}
                  onChange={(e) => update(i, { value: e.target.value })}
                  placeholder={t('query.valuePlaceholder')}
                  className="max-w-[200px]"
                  onKeyDown={(e) => e.key === 'Enter' && run()}
                />
              )}
              <button
                onClick={() => removeRule(i)}
                className="flex h-7 w-7 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={addRule}>
            <Plus className="h-3.5 w-3.5" />
            {t('query.addRule')}
          </Button>
          <Button size="sm" className="gap-1.5" onClick={run}>
            <Play className="h-3.5 w-3.5" />
            {t('query.run')}
          </Button>

          {/* Save current query (inline name entry) */}
          {naming ? (
            <div className="flex items-center gap-1">
              <Input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void confirmSave()
                  if (e.key === 'Escape') setNaming(false)
                }}
                placeholder={t('query.savePlaceholder')}
                className="h-8 w-48"
              />
              <Button size="sm" className="h-8 gap-1.5 px-2.5" onClick={confirmSave} disabled={!draftName.trim()}>
                <Check className="h-3.5 w-3.5" />
              </Button>
              <button
                onClick={() => setNaming(false)}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={startSave}>
              <BookmarkPlus className="h-3.5 w-3.5" />
              {t('query.save')}
            </Button>
          )}
        </div>
      </div>

      {/* Results */}
      {results !== null && (
        <>
          <div className="flex items-center gap-2 border-b border-border/40 px-4 py-2 text-xs text-muted-foreground">
            {t('query.results', { count: results.length })}
          </div>
          <ScrollArea className="flex-1">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card/95 text-left text-xs text-muted-foreground backdrop-blur">
                <tr className="border-b border-border/40">
                  <th className="px-4 py-2 font-medium">{t('query.fields.surname')}</th>
                  <th className="px-2 py-2 font-medium">{t('person.sex')}</th>
                  <th className="px-2 py-2 font-medium">{t('person.birth')}</th>
                  <th className="px-2 py-2 font-medium">{t('person.death')}</th>
                  <th className="px-2 py-2 font-medium">{t('person.place')}</th>
                </tr>
              </thead>
              <tbody>
                {results.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => selectPerson(p.id)}
                    className="cursor-pointer border-b border-border/50 hover:bg-accent"
                  >
                    <td className="px-4 py-1.5">
                      <div className="flex items-center gap-2">
                        <PersonAvatar personId={p.id} name={fullName(p)} sex={p.sex} className="h-7 w-7 text-[10px]" />
                        <span className="font-medium">{fullName(p)}</span>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">{p.sex}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">
                      {yearOf(p.birthDate)} {p.birthPlace ? `· ${p.birthPlace}` : ''}
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">{yearOf(p.deathDate)}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{p.birthPlace ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {results.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">{t('query.noResults')}</p>
            )}
          </ScrollArea>
        </>
      )}
    </div>
  )
}
