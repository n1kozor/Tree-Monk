import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Maximize2, Palette, Pencil, Tag, Trash2, Waypoints } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBoardStore } from './useBoardStore'
import type { EdgeCertainty } from '@shared/types'

export interface MenuState {
  type: 'node' | 'edge'
  id: string
  x: number
  y: number
  nodeKind?: string
}

const EDGE_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#e5e7eb']
const NOTE_COLORS = ['#fde68a', '#bfdbfe', '#bbf7d0', '#fecaca', '#e9d5ff', '#ffffff']
const SIZES: { key: string; w: number; label: string }[] = [
  { key: 's', w: 176, label: 'S' },
  { key: 'm', w: 224, label: 'M' },
  { key: 'l', w: 288, label: 'L' }
]
const CERTAINTIES: { key: EdgeCertainty; style: string; label: string }[] = [
  { key: 'verified', style: 'solid', label: 'board.certVerified' },
  { key: 'suspicion', style: 'dashed', label: 'board.certSuspicion' },
  { key: 'theory', style: 'dotted', label: 'board.certTheory' }
]

export function BoardContextMenu({
  menu,
  onClose,
  onEdit
}: {
  menu: MenuState
  onClose: () => void
  onEdit: (id: string) => void
}): JSX.Element {
  const { t } = useTranslation()
  const removeNode = useBoardStore((s) => s.removeNode)
  const removeEdge = useBoardStore((s) => s.removeEdge)
  const setEdgeColor = useBoardStore((s) => s.setEdgeColor)
  const setEdgeCertainty = useBoardStore((s) => s.setEdgeCertainty)
  const setEdgeLabel = useBoardStore((s) => s.setEdgeLabel)
  const updateNodeData = useBoardStore((s) => s.updateNodeData)
  const persistNode = useBoardStore((s) => s.persistNode)
  const edge = useBoardStore((s) => (menu.type === 'edge' ? s.edges.find((e) => e.id === menu.id) : undefined))

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const resize = (w: number): void => {
    updateNodeData(menu.id, { width: w })
    persistNode(menu.id)
    onClose()
  }
  const recolorNode = (c: string): void => {
    updateNodeData(menu.id, { color: c })
    persistNode(menu.id)
    onClose()
  }

  const resizable = menu.nodeKind !== 'zone'
  const currentCertainty = (edge?.data?.certainty as EdgeCertainty) ?? 'verified'

  return (
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div
        className="fixed z-[61] min-w-[190px] overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-2xl"
        style={{ left: menu.x, top: menu.y }}
        onClick={(e) => e.stopPropagation()}
      >
        {menu.type === 'node' && (
          <>
            <button className="ctx-item" onClick={() => { onEdit(menu.id); onClose() }}>
              <Pencil className="h-3.5 w-3.5" /> {t('common.edit')}
            </button>
            {resizable && (
              <>
                <div className="ctx-label">
                  <Maximize2 className="h-3 w-3" /> {t('ctx.resize')}
                </div>
                <div className="flex gap-1 px-2 pb-1">
                  {SIZES.map((s) => (
                    <button key={s.key} className="ctx-chip" onClick={() => resize(s.w)}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </>
            )}
            {menu.nodeKind === 'note' && (
              <>
                <div className="ctx-label">
                  <Palette className="h-3 w-3" /> {t('ctx.color')}
                </div>
                <div className="flex flex-wrap gap-1.5 px-2 pb-1.5">
                  {NOTE_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => recolorNode(c)}
                      className="h-5 w-5 rounded-full border border-foreground/20"
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </>
            )}
            <div className="my-1 h-px bg-border" />
            <button className="ctx-item text-destructive" onClick={() => { removeNode(menu.id); onClose() }}>
              <Trash2 className="h-3.5 w-3.5" /> {t('common.delete')}
            </button>
          </>
        )}

        {menu.type === 'edge' && (
          <>
            {/* Certainty — evidence strength */}
            <div className="ctx-label">
              <Waypoints className="h-3 w-3" /> {t('board.certainty')}
            </div>
            <div className="flex flex-col gap-0.5 px-1 pb-1">
              {CERTAINTIES.map((c) => (
                <button
                  key={c.key}
                  onClick={() => { setEdgeCertainty(menu.id, c.key); onClose() }}
                  className={cn(
                    'flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-accent',
                    currentCertainty === c.key && 'bg-accent'
                  )}
                >
                  <span className="w-8 border-t-2 border-current" style={{ borderStyle: c.style }} />
                  {t(c.label)}
                </button>
              ))}
            </div>

            {/* Edge label */}
            <div className="ctx-label">
              <Tag className="h-3 w-3" /> {t('board.edgeLabel')}
            </div>
            <div className="px-2 pb-1.5">
              <input
                defaultValue={typeof edge?.label === 'string' ? edge.label : ''}
                placeholder={t('board.edgeLabelPlaceholder')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setEdgeLabel(menu.id, (e.target as HTMLInputElement).value.trim() || null)
                    onClose()
                  }
                }}
                onBlur={(e) => setEdgeLabel(menu.id, e.target.value.trim() || null)}
                className="w-full rounded border border-border bg-secondary px-2 py-1 text-xs outline-none focus:border-primary/60"
              />
            </div>

            {/* Color */}
            <div className="ctx-label">
              <Palette className="h-3 w-3" /> {t('ctx.edgeColor')}
            </div>
            <div className="flex flex-wrap gap-1.5 px-2 pb-1.5">
              {EDGE_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => { setEdgeColor(menu.id, c); onClose() }}
                  className="h-5 w-5 rounded-full border border-foreground/20"
                  style={{ background: c }}
                />
              ))}
              <button
                onClick={() => { setEdgeColor(menu.id, null); onClose() }}
                className="flex h-5 items-center rounded px-1.5 text-[10px] text-muted-foreground hover:bg-accent"
              >
                {t('ctx.reset')}
              </button>
            </div>
            <div className="my-1 h-px bg-border" />
            <button className="ctx-item text-destructive" onClick={() => { removeEdge(menu.id); onClose() }}>
              <Trash2 className="h-3.5 w-3.5" /> {t('common.delete')}
            </button>
          </>
        )}
      </div>
    </>
  )
}
