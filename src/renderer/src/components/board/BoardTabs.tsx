import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Pencil, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NameDialog } from '@/components/common/NameDialog'
import { useBoardStore } from './useBoardStore'

interface TabMenu {
  id: string
  name: string
  x: number
  y: number
}

export function BoardTabs(): JSX.Element {
  const { t } = useTranslation()
  const boards = useBoardStore((s) => s.boards)
  const currentBoardId = useBoardStore((s) => s.currentBoardId)
  const loadBoards = useBoardStore((s) => s.loadBoards)
  const switchBoard = useBoardStore((s) => s.switchBoard)
  const createBoard = useBoardStore((s) => s.createBoard)
  const renameBoard = useBoardStore((s) => s.renameBoard)
  const removeBoard = useBoardStore((s) => s.removeBoard)
  const duplicateBoard = useBoardStore((s) => s.duplicateBoard)

  const [createOpen, setCreateOpen] = useState(false)
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [menu, setMenu] = useState<TabMenu | null>(null)

  useEffect(() => {
    loadBoards()
  }, [loadBoards])

  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border bg-card/40 px-2">
      <div className="flex items-center gap-1 overflow-x-auto">
        {boards.map((b) => {
          const active = b.id === currentBoardId
          return (
            <div
              key={b.id}
              onClick={() => !active && switchBoard(b.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                setMenu({ id: b.id, name: b.name, x: e.clientX, y: e.clientY })
              }}
              className={cn(
                'flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
                active
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <span className="max-w-[160px] truncate">{b.name}</span>
            </div>
          )
        })}
      </div>
      <button
        onClick={() => setCreateOpen(true)}
        title={t('boards.new')}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Plus className="h-4 w-4" />
      </button>

      {/* Create board modal */}
      <NameDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={t('boards.newTitle')}
        initial={`${t('boards.defaultName')} ${boards.length + 1}`}
        placeholder={t('boards.namePlaceholder')}
        submitLabel={t('boards.create')}
        onSubmit={(name) => createBoard(name)}
      />

      {/* Rename board modal */}
      <NameDialog
        open={!!renaming}
        onOpenChange={(o) => !o && setRenaming(null)}
        title={t('boards.rename')}
        initial={renaming?.name ?? ''}
        submitLabel={t('common.save')}
        onSubmit={(name) => renaming && renameBoard(renaming.id, name)}
      />

      {/* Tab right-click menu */}
      {menu && (
        <>
          <div
            className="fixed inset-0 z-[60]"
            onClick={() => setMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu(null)
            }}
          />
          <div
            className="fixed z-[61] min-w-[160px] overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-2xl"
            style={{ left: menu.x, top: menu.y }}
          >
            <button
              className="ctx-item"
              onClick={() => {
                setRenaming({ id: menu.id, name: menu.name })
                setMenu(null)
              }}
            >
              <Pencil className="h-3.5 w-3.5" /> {t('boards.rename')}
            </button>
            <button
              className="ctx-item"
              onClick={() => {
                duplicateBoard(menu.id, `${menu.name} ${t('boards.copySuffix')}`)
                setMenu(null)
              }}
            >
              <Copy className="h-3.5 w-3.5" /> {t('boards.duplicate')}
            </button>
            {boards.length > 1 && (
              <>
                <div className="my-1 h-px bg-border" />
                <button
                  className="ctx-item text-destructive"
                  onClick={() => {
                    removeBoard(menu.id)
                    setMenu(null)
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> {t('boards.delete')}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
