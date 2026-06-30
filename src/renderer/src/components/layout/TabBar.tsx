import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { useAppStore, type Tab } from '@/store/useAppStore'
import { PersonAvatar } from '@/components/common/PersonAvatar'
import { cn, fullName } from '@/lib/utils'

/** One profile tab: live avatar + name, click to focus, middle-click / × to close, drag to reorder. */
function TabPill({
  tab,
  active,
  dragId,
  onDragId
}: {
  tab: Tab
  active: boolean
  dragId: string | null
  onDragId: (id: string | null) => void
}): JSX.Element {
  const { t } = useTranslation()
  const activateTab = useAppStore((s) => s.activateTab)
  const closeTab = useAppStore((s) => s.closeTab)
  const moveTab = useAppStore((s) => s.moveTab)
  const tabs = useAppStore((s) => s.tabs)
  const person = useAppStore((s) => (tab.ref ? s.peopleById.get(tab.ref) : undefined))
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [active])

  const title = person ? fullName(person) : t('common.unknown')

  return (
    <div
      ref={ref}
      role="tab"
      aria-selected={active}
      draggable
      onClick={() => activateTab(tab.id)}
      onAuxClick={(e) => {
        if (e.button === 1) {
          e.preventDefault()
          closeTab(tab.id)
        }
      }}
      onDragStart={() => onDragId(tab.id)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        if (dragId && dragId !== tab.id) {
          moveTab(
            dragId,
            tabs.findIndex((x) => x.id === tab.id)
          )
        }
        onDragId(null)
      }}
      onDragEnd={() => onDragId(null)}
      title={title}
      className={cn(
        'group flex h-8 max-w-[200px] shrink-0 cursor-pointer select-none items-center gap-1.5 rounded-t-lg border-x border-t px-2.5 text-xs transition-colors',
        active
          ? 'border-border/50 bg-background/70 font-medium text-foreground shadow-[inset_0_1px_0_hsl(var(--glass-highlight)/0.4)] backdrop-blur-md'
          : 'border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground'
      )}
    >
      <PersonAvatar
        personId={person?.id}
        name={person ? fullName(person) : '?'}
        sex={person?.sex}
        className="h-4 w-4 shrink-0 text-[8px]"
      />
      <span className="truncate">{title}</span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          closeTab(tab.id)
        }}
        className={cn(
          'ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded transition-colors hover:bg-foreground/10',
          active ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover:opacity-70 hover:!opacity-100'
        )}
        title={t('common.close')}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

/** Browser-style strip of open person profiles. Hidden when none are open. */
export function TabBar(): JSX.Element | null {
  const tabs = useAppStore((s) => s.tabs)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const [dragId, setDragId] = useState<string | null>(null)

  if (tabs.length === 0) return null

  return (
    <div className="glass-edge flex items-end gap-0.5 overflow-x-auto border-b border-border/40 px-1.5 pt-1.5 [scrollbar-width:thin]">
      {tabs.map((tab) => (
        <TabPill
          key={tab.id}
          tab={tab}
          active={tab.id === activeTabId}
          dragId={dragId}
          onDragId={setDragId}
        />
      ))}
    </div>
  )
}
