import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarClock, Check, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useDateFormat } from '@/hooks/useDateFormat'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/utils'
import type { Todo, TodoPriority } from '@shared/types'
import { TodoDialog } from '@/components/todos/TodoDialog'

const PRIORITY_TONE: Record<TodoPriority, string> = {
  high: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  normal: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  low: 'bg-slate-500/15 text-slate-600 dark:text-slate-300'
}

/** The to-dos linked to this person, shown on their profile. Toggle done, open
 *  the editor, or add a new task already linked to this person. */
export function PersonTodos({ personId }: { personId: string }): JSX.Element {
  const { t } = useTranslation()
  const fmtDate = useDateFormat()
  const todosByPerson = useAppStore((s) => s.todosByPerson)
  const refreshTodos = useAppStore((s) => s.refreshTodos)

  const [editing, setEditing] = useState<Todo | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const today = new Date().toISOString().slice(0, 10)
  const todos = useMemo(() => {
    const list = todosByPerson.get(personId) ?? []
    // Open first (by priority), done last.
    const rank = (p: TodoPriority): number => (p === 'high' ? 0 : p === 'normal' ? 1 : 2)
    return [...list].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1
      return rank(a.priority) - rank(b.priority)
    })
  }, [todosByPerson, personId])

  const openNew = (): void => {
    setEditing(null)
    setDialogOpen(true)
  }

  const toggleDone = async (td: Todo): Promise<void> => {
    await window.api.todos.update(td.id, { done: !td.done })
    await refreshTodos()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('todos.title')} ({todos.length})
        </h4>
        <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={openNew}>
          <Plus className="h-3.5 w-3.5" /> {t('todos.new')}
        </Button>
      </div>

      {todos.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{t('todos.personEmpty')}</p>
      ) : (
        <div className="space-y-2">
          {todos.map((td) => {
            const overdue = !td.done && !!td.dueDate && td.dueDate < today
            return (
              <div
                key={td.id}
                onClick={() => {
                  setEditing(td)
                  setDialogOpen(true)
                }}
                className="group flex cursor-pointer items-start gap-2.5 rounded-xl border border-border/40 bg-secondary/40 p-2.5 transition-colors hover:border-primary/40 hover:bg-accent"
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    void toggleDone(td)
                  }}
                  title={td.done ? t('todos.markOpen') : t('todos.markDone')}
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                    td.done
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border hover:border-primary'
                  )}
                >
                  {td.done && <Check className="h-3 w-3" strokeWidth={3} />}
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
                          'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                          PRIORITY_TONE[td.priority]
                        )}
                      >
                        {t(`todos.priority.${td.priority}`)}
                      </span>
                    )}
                  </div>
                  {td.note && (
                    <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">
                      {td.note}
                    </p>
                  )}
                  {td.dueDate && (
                    <span
                      className={cn(
                        'mt-1 flex items-center gap-1 text-[11px] tabular-nums',
                        overdue ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-muted-foreground'
                      )}
                    >
                      <CalendarClock className="h-3 w-3" />
                      {fmtDate(td.dueDate)}
                      {overdue && <span className="ml-0.5">· {t('todos.overdue')}</span>}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <TodoDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        todo={editing}
        presetPersonIds={[personId]}
        onSaved={refreshTodos}
      />
    </div>
  )
}
