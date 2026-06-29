import { memo, useEffect, useState } from 'react'
import { type NodeProps } from '@xyflow/react'
import { motion } from 'framer-motion'
import { Briefcase, MapPin, Search, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBoardStore, type BoardNodeData } from '../useBoardStore'
import { useAppStore } from '@/store/useAppStore'
import { fullName, yearOf } from '@/lib/utils'
import { PersonAvatar } from '@/components/common/PersonAvatar'
import { rotationFor } from '../nodeUtil'
import { NodeHandles } from './NodeHandles'
import { ThreadPins } from './ThreadPins'
import { useTranslation } from 'react-i18next'
import type { ResearchLog } from '@shared/types'

const SPRING = { type: 'spring', stiffness: 520, damping: 32 } as const
const EMPTY: ResearchLog[] = []
const RESULT_COLOR: Record<string, string> = {
  negative: '#ef4444',
  positive: '#22c55e',
  inconclusive: '#f59e0b'
}

/** First segment of a place ("Budapest, Pest, Hungary" → "Budapest"). */
function shortPlace(place?: string | null): string {
  if (!place) return ''
  return place.split(',')[0].trim()
}

function PersonNodeImpl({ id, data, selected, dragging }: NodeProps): JSX.Element {
  const { t } = useTranslation()
  const d = data as BoardNodeData
  const update = useBoardStore((s) => s.updateNodeData)
  const persist = useBoardStore((s) => s.persistNode)
  const cork = useBoardStore((s) => s.boardMode === 'corkboard')
  const selectPerson = useAppStore((s) => s.selectPerson)
  // O(1) lookups instead of scanning the whole arrays.
  const person = useAppStore((s) => (d.refId ? s.peopleById.get(d.refId) : undefined))
  const logs = useAppStore((s) => (d.refId ? s.researchByPerson.get(d.refId) ?? EMPTY : EMPTY))
  const editReq = useBoardStore((s) => s.editingNodeId === id)
  const requestEdit = useBoardStore((s) => s.requestEdit)
  const [editing, setEditing] = useState(false)
  const rotate = cork ? rotationFor(id) : 0

  useEffect(() => {
    if (editReq) {
      setEditing(true)
      requestEdit(null)
    }
  }, [editReq, requestEdit])

  const name = person ? fullName(person) : d.label ?? 'New person'
  const birth = person ? yearOf(person.birthDate) : ''
  const death = person ? yearOf(person.deathDate) : ''
  const bp = shortPlace(person?.birthPlace)
  const dp = shortPlace(person?.deathPlace)
  const occupation = person?.occupation?.trim() || ''
  const muted = cork ? 'text-zinc-600' : 'text-muted-foreground'

  return (
    <div
      className="relative"
      style={{ width: d.width ?? 232, transform: rotate ? `rotate(${rotate}deg)` : undefined }}
    >
      <NodeHandles />
      {cork && <ThreadPins nodeId={id} />}
      <motion.div
        animate={{ scale: dragging ? 1.05 : 1 }}
        transition={SPRING}
        onDoubleClick={() => (person ? selectPerson(person.id) : setEditing(true))}
        title={person ? 'Double-click to open profile' : undefined}
        className={cn(
          'w-full',
          cork
            ? 'cork-paper rounded-[2px]'
            : 'rounded-xl border border-border bg-card text-card-foreground shadow-sm hover:border-primary/40',
          selected && 'ring-2 ring-primary'
        )}
      >
        <div className="flex items-start gap-3 px-3 py-2.5">
          {person ? (
            <PersonAvatar
              personId={person.id}
              name={name}
              sex={person.sex}
              className={cn('h-12 w-12 text-sm', cork && 'rounded-sm ring-1 ring-black/15')}
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-stone-300 text-stone-700">
              <User className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            {editing ? (
              <input
                autoFocus
                className={cn(
                  'nodrag w-full rounded px-1 py-0.5 text-sm outline-none',
                  cork ? 'bg-black/10' : 'bg-foreground/10'
                )}
                defaultValue={d.label ?? ''}
                onBlur={(e) => {
                  update(id, { label: e.target.value })
                  persist(id)
                  setEditing(false)
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            ) : (
              <p className="truncate text-sm font-semibold leading-tight">{name}</p>
            )}

            {/* Vital facts — enough to tell two same-named people apart. */}
            {person ? (
              <div className={cn('mt-0.5 space-y-px text-[11px] leading-snug', muted)}>
                {(birth || bp) && (
                  <p className="flex items-center gap-1 truncate" title={person.birthPlace ?? ''}>
                    <span className="font-semibold text-zinc-500">∗</span>
                    <span className="truncate">
                      {[birth, bp].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </p>
                )}
                {(death || dp || person.deceased) && (
                  <p className="flex items-center gap-1 truncate" title={person.deathPlace ?? ''}>
                    <span className="font-semibold text-zinc-500">†</span>
                    <span className="truncate">
                      {[death, dp].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </p>
                )}
                {occupation && (
                  <p className="flex items-center gap-1 truncate" title={occupation}>
                    <Briefcase className="h-3 w-3 shrink-0 opacity-70" />
                    <span className="truncate">{occupation}</span>
                  </p>
                )}
              </div>
            ) : (
              <span className="text-[10px] uppercase tracking-wide text-red-600/80">
                {t('board.unverified')}
              </span>
            )}
          </div>
        </div>

        {/* Research findings pinned to the suspect's card. */}
        {person && logs.length > 0 && (
          <div className={cn('space-y-0.5 border-t px-3 py-1.5', cork ? 'border-zinc-900/15' : 'border-border')}>
            <div className={cn('flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide', muted)}>
              <Search className="h-3 w-3" /> {t('person.research')} · {logs.length}
            </div>
            {logs.slice(0, 3).map((l) => (
              <div key={l.id} className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: RESULT_COLOR[l.result] }} />
                <span className={cn('truncate text-[11px]', cork ? 'text-zinc-700' : 'text-foreground/80')}>
                  {l.title || l.sourceDesc || '—'}
                </span>
              </div>
            ))}
            {logs.length > 3 && (
              <div className={cn('text-[10px]', cork ? 'text-zinc-500' : 'text-muted-foreground')}>
                +{logs.length - 3}
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  )
}

export const PersonNode = memo(PersonNodeImpl)
