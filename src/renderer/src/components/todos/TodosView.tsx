import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarClock, Check, ListChecks, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ConfirmDialog, toastUndo } from '@/components/common/ConfirmDialog'
import { PersonAvatar } from '@/components/common/PersonAvatar'
import { useDateFormat } from '@/hooks/useDateFormat'
import { useAppStore } from '@/store/useAppStore'
import { cn, fullName } from '@/lib/utils'
import type { Todo, TodoPriority } from '@shared/types'
import { TodoDialog } from './TodoDialog'

/**
 * To-do overview — every task across the whole tree in one place. Create tasks,
 * mark them done, and link people; a task shows up on each linked person's
 * profile. Filter by state (open / done) or free text.
 */

type Filter = 'open' | 'done' | 'all'

const PRIORITY_TONE: Record<TodoPriority, string> = {
  high: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  normal: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  low: 'bg-slate-500/15 text-slate-600 dark:text-slate-300'
}

export function TodosView(): JSX.Element {
  const { t } = useTranslation()
  const fmtDate = useDateFormat()
  const todos = useAppStore((s) => s.todos)
  const peopleById = useAppStore((s) => s.peopleById)
  const selectPerson = useAppStore((s) => s.selectPerson)
  const refreshTodos = useAppStore((s) => s.refreshTodos)

  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('open')
  const [editing, setEditing] = useState<Todo | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState<Todo | null>(null)

  const today = new Date().toISOString().slice(0, 10)

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return todos.filter((td) => {
      if (filter === 'open' && td.done) return false
      if (filter === 'done' && !td.done) return false
      if (!needle) return true
      const names = td.personIds.map((id) => {
        const p = peopleById.get(id)
        return p ? fullName(p) : ''
      })
      return [td.title, td.note ?? '', ...names].join(' ').toLowerCase().includes(needle)
    })
  }, [todos, q, filter, peopleById])

  const openCount = useMemo(() => todos.filter((td) => !td.done).length, [todos])

  const openNew = (): void => {
    setEditing(null)
    setDialogOpen(true)
  }
  const openEdit = (td: Todo): void => {
    setEditing(td)
    setDialogOpen(true)
  }

  const toggleDone = async (td: Todo): Promise<void> => {
    await window.api.todos.update(td.id, { done: !td.done })
    await refreshTodos()
  }

  const confirmDelete = async (): Promise<void> => {
    if (!deleting) return
    const snap = deleting
    await window.api.todos.remove(snap.id)
    await refreshTodos()
    toastUndo(t('todos.deleted', { title: snap.title || t('todos.untitled') }), t('common.undo'), async () => {
      await window.api.todos.create({
        title: snap.title,
        note: snap.note,
        done: snap.done,
        priority: snap.priority,
        dueDate: snap.dueDate,
        personIds: snap.personIds
      })
      await refreshTodos()
    })
    setDeleting(null)
  }

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'open', label: t('todos.filterOpen') },
    { key: 'done', label: t('todos.filterDone') },
    { key: 'all', label: t('todos.filterAll') }
  ]

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2.5 border-b border-border/60 p-4">
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ListChecks className="h-4 w-4 text-primary" />
            {t('todos.title')}
          </h2>
          <span className="text-xs tabular-nums text-muted-foreground">
            {t('todos.openCount', { count: openCount })}
          </span>
          <div className="flex-1" />
          <div className="relative w-56">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('common.search')}
              className="h-9 pl-8"
            />
          </div>
          <Button onClick={openNew} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            {t('todos.new')}
          </Button>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                filter === f.key
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border/60 text-muted-foreground hover:bg-accent'
              )}
            >
              {f.label}
            </button>
          ))}
          {q && (
            <button
              onClick={() => setQ('')}
              className="ml-1 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" /> {t('people.clear')}
            </button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-3xl space-y-2.5 p-4">
          {list.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <ListChecks className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">{t('todos.empty')}</p>
              <Button onClick={openNew} variant="outline" size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                {t('todos.new')}
              </Button>
            </div>
          )}

          {list.map((td) => {
            const overdue = !td.done && !!td.dueDate && td.dueDate < today
            const people = td.personIds.map((id) => peopleById.get(id)).filter((p) => !!p)
            return (
              <div key={td.id} className="glass group flex items-start gap-3 rounded-2xl p-3.5">
                <button
                  onClick={() => void toggleDone(td)}
                  title={td.done ? t('todos.markOpen') : t('todos.markDone')}
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                    td.done
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border hover:border-primary'
                  )}
                >
                  {td.done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'min-w-0 truncate text-sm font-medium',
                        td.done && 'text-muted-foreground line-through'
                      )}
                    >
                      {td.title || t('todos.untitled')}
                    </span>
                    {td.priority !== 'normal' && (
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          PRIORITY_TONE[td.priority]
                        )}
                      >
                        {t(`todos.priority.${td.priority}`)}
                      </span>
                    )}
                  </div>

                  {td.note && (
                    <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">{td.note}</p>
                  )}

                  {(td.dueDate || people.length > 0) && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      {td.dueDate && (
                        <span
                          className={cn(
                            'flex items-center gap-1 text-[11px] tabular-nums',
                            overdue ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-muted-foreground'
                          )}
                        >
                          <CalendarClock className="h-3.5 w-3.5" />
                          {fmtDate(td.dueDate)}
                          {overdue && <span className="ml-0.5">· {t('todos.overdue')}</span>}
                        </span>
                      )}
                      {people.length > 0 && (
                        <div className="flex items-center gap-1">
                          {people.slice(0, 5).map(
                            (p) =>
                              p && (
                                <button
                                  key={p.id}
                                  onClick={() => selectPerson(p.id)}
                                  title={fullName(p)}
                                  className="rounded-full ring-2 ring-background transition-transform hover:z-10 hover:scale-110"
                                >
                                  <PersonAvatar
                                    personId={p.id}
                                    name={fullName(p)}
                                    sex={p.sex}
                                    className="h-6 w-6 text-[9px]"
                                  />
                                </button>
                              )
                          )}
                          {people.length > 5 && (
                            <span className="text-[11px] font-medium text-muted-foreground">
                              +{people.length - 5}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => openEdit(td)}
                    title={t('common.edit')}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleting(td)}
                    title={t('common.delete')}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </ScrollArea>

      <TodoDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        todo={editing}
        onSaved={refreshTodos}
      />

      {deleting && (
        <ConfirmDialog
          open={!!deleting}
          onOpenChange={(o) => !o && setDeleting(null)}
          title={t('todos.deleteTitle', { title: deleting.title || t('todos.untitled') })}
          confirmLabel={t('common.delete')}
          onConfirm={confirmDelete}
        >
          <p>{t('todos.deleteConfirm')}</p>
        </ConfirmDialog>
      )}
    </div>
  )
}
