import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Users, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { PersonAvatar } from '@/components/common/PersonAvatar'
import { AttachToPeopleDialog } from '@/components/person/AttachToPeopleDialog'
import { useAppStore } from '@/store/useAppStore'
import { cn, fullName } from '@/lib/utils'
import type { Todo, TodoInput, TodoPriority } from '@shared/types'

const PRIORITIES: TodoPriority[] = ['high', 'normal', 'low']

const PRIORITY_TONE: Record<TodoPriority, string> = {
  high: 'border-rose-500/50 bg-rose-500/15 text-rose-600 dark:text-rose-400',
  normal: 'border-sky-500/50 bg-sky-500/15 text-sky-600 dark:text-sky-400',
  low: 'border-slate-500/40 bg-slate-500/10 text-slate-600 dark:text-slate-300'
}

/**
 * Create / edit a to-do. All fields live in local state until save; the person
 * links are managed in memory (via {@link AttachToPeopleDialog} in manage mode)
 * and persisted together with the to-do as `personIds` on save.
 */
export function TodoDialog({
  open,
  onClose,
  todo,
  presetPersonIds,
  onSaved
}: {
  open: boolean
  onClose: () => void
  /** Editing an existing to-do, or `null` to create a new one. */
  todo: Todo | null
  /** People to pre-link on a NEW to-do (e.g. opened from a person's profile). */
  presetPersonIds?: string[]
  onSaved: () => Promise<void> | void
}): JSX.Element {
  const { t } = useTranslation()
  const peopleById = useAppStore((s) => s.peopleById)

  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [priority, setPriority] = useState<TodoPriority>('normal')
  const [dueDate, setDueDate] = useState('')
  const [personIds, setPersonIds] = useState<string[]>([])
  const [pickOpen, setPickOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  // Reset the form each time the dialog opens (for a new or a different to-do).
  useEffect(() => {
    if (!open) return
    setTitle(todo?.title ?? '')
    setNote(todo?.note ?? '')
    setPriority(todo?.priority ?? 'normal')
    setDueDate(todo?.dueDate ?? '')
    setPersonIds(todo?.personIds ?? presetPersonIds ?? [])
  }, [open, todo, presetPersonIds])

  const attachLocal = async (pid: string): Promise<void> => {
    setPersonIds((prev) => (prev.includes(pid) ? prev : [...prev, pid]))
  }
  const detachLocal = async (pid: string): Promise<void> => {
    setPersonIds((prev) => prev.filter((x) => x !== pid))
  }

  const people = personIds.map((id) => peopleById.get(id)).filter((p) => !!p)

  const save = async (): Promise<void> => {
    setBusy(true)
    const input: TodoInput = {
      title: title.trim(),
      note: note.trim() || null,
      priority,
      dueDate: dueDate.trim() || null,
      personIds
    }
    if (todo) await window.api.todos.update(todo.id, input)
    else await window.api.todos.create(input)
    setBusy(false)
    await onSaved()
    onClose()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
        <DialogContent className="flex max-h-[85vh] max-w-lg flex-col">
          <DialogHeader>
            <DialogTitle>{todo ? t('todos.editTitle') : t('todos.newTitle')}</DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-1 pr-1">
            {/* Title */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('todos.fieldTitle')}
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('todos.titlePlaceholder')}
                autoFocus
              />
            </div>

            {/* Note */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('todos.fieldNote')}
              </label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('todos.notePlaceholder')}
                rows={3}
              />
            </div>

            <div className="flex flex-wrap gap-4">
              {/* Priority */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('todos.fieldPriority')}
                </label>
                <div className="flex gap-1.5">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                        priority === p
                          ? PRIORITY_TONE[p]
                          : 'border-border/60 text-muted-foreground hover:bg-accent'
                      )}
                    >
                      {t(`todos.priority.${p}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Due date */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('todos.fieldDue')}
                </label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-40"
                />
              </div>
            </div>

            {/* Attached people */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('todos.fieldPeople')}
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                {people.map(
                  (p) =>
                    p && (
                      <span
                        key={p.id}
                        className="flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 py-1 pl-1 pr-1 text-xs"
                      >
                        <PersonAvatar
                          personId={p.id}
                          name={fullName(p)}
                          sex={p.sex}
                          className="h-5 w-5 text-[8px]"
                        />
                        <span className="max-w-[9rem] truncate font-medium">{fullName(p)}</span>
                        <button
                          type="button"
                          onClick={() => void detachLocal(p.id)}
                          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    )
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPickOpen(true)}
                  className="gap-1.5"
                >
                  <Users className="h-3.5 w-3.5" />
                  {people.length ? t('todos.editPeople') : t('todos.addPeople')}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void save()} disabled={busy || !title.trim()}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {pickOpen && (
        <AttachToPeopleDialog
          open={pickOpen}
          onClose={() => setPickOpen(false)}
          attach={attachLocal}
          onDetach={detachLocal}
          currentIds={personIds}
          onAttached={() => {}}
          label={title.trim() || t('todos.newTitle')}
        />
      )}
    </>
  )
}
