import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Structured editor for MULTIPLE given names on top of the existing
 * space-separated `givenName` string — so storage, search and GEDCOM stay
 * exactly as they were. Each name is a numbered chip: type + space/Enter adds
 * the next one, drag a chip onto another to reorder, ✕ removes.
 */
export function GivenNamesEditor({
  value,
  onCommit,
  className
}: {
  /** The stored space-separated given names. */
  value: string
  /** Called with the new space-separated string whenever the list changes. */
  onCommit: (next: string) => void
  className?: string
}): JSX.Element {
  const { t } = useTranslation()
  const names = value.trim() ? value.trim().split(/\s+/) : []
  const [draft, setDraft] = useState('')
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // A person switch mid-typing must not leak the draft to the next person.
  useEffect(() => setDraft(''), [value])

  const commit = (arr: string[]): void => onCommit(arr.filter(Boolean).join(' '))

  const addDraft = (): void => {
    const parts = draft.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return
    setDraft('')
    commit([...names, ...parts])
  }
  const remove = (i: number): void => commit(names.filter((_, x) => x !== i))
  const moveTo = (target: number): void => {
    if (dragIdx === null || dragIdx === target) return
    const next = [...names]
    const [moved] = next.splice(dragIdx, 1)
    next.splice(target, 0, moved)
    setDragIdx(null)
    commit(next)
  }

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      title={t('person.givenNamesHint')}
      className={cn(
        'flex min-h-9 w-full cursor-text flex-wrap items-center gap-1 rounded-lg border border-input bg-background px-1.5 py-1 focus-within:border-primary',
        className
      )}
    >
      {names.map((n, i) => (
        <span
          key={`${n}-${i}`}
          draggable={names.length > 1}
          onDragStart={() => setDragIdx(i)}
          onDragEnd={() => setDragIdx(null)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            moveTo(i)
          }}
          title={names.length > 1 ? t('common.dragToReorder') : undefined}
          className={cn(
            'flex items-center gap-1 rounded-md border border-border/40 bg-secondary/60 py-0.5 pl-1.5 pr-0.5 text-sm',
            names.length > 1 && 'cursor-grab active:cursor-grabbing',
            dragIdx === i && 'opacity-50'
          )}
        >
          {names.length > 1 && (
            <span className="text-[9px] font-semibold tabular-nums text-muted-foreground/70">{i + 1}.</span>
          )}
          {n}
          <button
            onClick={(e) => {
              e.stopPropagation()
              remove(i)
            }}
            tabIndex={-1}
            className="rounded-full p-0.5 text-muted-foreground hover:text-destructive"
            title={t('common.delete')}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            addDraft()
          } else if (e.key === 'Backspace' && !draft && names.length > 0) {
            // Backspace on an empty input pulls the last chip back for editing.
            e.preventDefault()
            setDraft(names[names.length - 1])
            commit(names.slice(0, -1))
          }
        }}
        onBlur={addDraft}
        placeholder={names.length === 0 ? t('person.givenName') : ''}
        className="h-7 min-w-[72px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  )
}
