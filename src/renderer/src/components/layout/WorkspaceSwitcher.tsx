import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { clearStartChoice } from '@/lib/fsMode'
import { norm } from '@/lib/nameMatch'
import { Check, ChevronDown, Pencil, Plus, Search, Trash2, TreePine } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { NameDialog } from '@/components/common/NameDialog'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import type { Workspace } from '@shared/types'

/** From this many trees on, the menu gets a filter box. */
const SEARCH_FROM = 9

/**
 * The prominent "mandant" picker in the top bar: shows the active family tree
 * and lets the user switch, create, rename or delete trees. Switching/creating
 * relaunches the app (handled in main) so every cache opens the new database.
 * The tree list scrolls inside the menu; the actions below it always stay in
 * view, however many trees there are.
 */
export function WorkspaceSwitcher(): JSX.Element | null {
  const { t } = useTranslation()
  const [list, setList] = useState<Workspace[]>([])
  const [active, setActive] = useState<Workspace | null>(null)
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [q, setQ] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const activeItemRef = useRef<HTMLDivElement>(null)

  // On open: fresh filter, the active tree scrolled into view, and — on a long
  // list — the cursor in the filter box. Deferred a tick so the menu's own
  // focus handling runs first.
  useEffect(() => {
    if (!menuOpen) return
    setQ('')
    const id = window.setTimeout(() => {
      activeItemRef.current?.scrollIntoView({ block: 'nearest' })
      searchRef.current?.focus()
    }, 0)
    return () => window.clearTimeout(id)
  }, [menuOpen])

  useEffect(() => {
    Promise.all([window.api.workspaces.list(), window.api.workspaces.active()])
      .then(([l, a]) => {
        setList(l)
        setActive(a)
      })
      .catch(() => {})
  }, [])

  if (!active) return null

  const create = (name: string): void => {
    // A brand-new (empty) tree → offer the FS / Manual start choice again.
    clearStartChoice()
    void window.api.workspaces.create(name)
  }
  const switchTo = (id: string): void => {
    if (id !== active.id) void window.api.workspaces.switch(id)
  }
  const rename = async (name: string): Promise<void> => {
    await window.api.workspaces.rename(active.id, name)
    setActive({ ...active, name })
    setList((l) => l.map((w) => (w.id === active.id ? { ...w, name } : w)))
  }
  const remove = (): void => void window.api.workspaces.remove(active.id)

  const nq = norm(q)
  const shown = nq ? list.filter((w) => norm(w.name).includes(nq)) : list

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button className="glass-subtle flex max-w-[11rem] items-center gap-2 rounded-xl px-3 py-1.5 text-left transition-colors hover:bg-accent xl:max-w-[15rem]">
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white"
              style={{ backgroundColor: active.color }}
            >
              <TreePine className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0">
              <span className="block text-[10px] uppercase leading-none tracking-wide text-muted-foreground">
                {t('workspace.label')}
              </span>
              <span className="block truncate text-sm font-semibold leading-tight">
                {active.name}
              </span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          collisionPadding={8}
          className="flex max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-[15rem] flex-col"
        >
          <DropdownMenuLabel>{t('workspace.switch')}</DropdownMenuLabel>
          {list.length >= SEARCH_FROM && (
            <div className="relative mx-1 mb-1 shrink-0">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={searchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  // Typing belongs to the box, not to the menu's type-to-jump;
                  // ↓ steps into the list, Esc still closes the menu.
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (shown[0]) switchTo(shown[0].id)
                  } else if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    listRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
                  }
                  if (e.key !== 'Escape') e.stopPropagation()
                }}
                placeholder={t('common.search')}
                data-testid="workspace-search"
                className="h-8 w-full rounded-lg border border-border/50 bg-background/70 pl-8 pr-2 text-sm outline-none focus:border-primary"
              />
            </div>
          )}
          <div ref={listRef} data-testid="workspace-list" className="-mx-1.5 min-h-0 flex-1 overflow-y-auto px-1.5">
            {shown.map((w) => (
              <DropdownMenuItem
                key={w.id}
                ref={w.id === active.id ? activeItemRef : undefined}
                onClick={() => switchTo(w.id)}
                className="gap-2"
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: w.color }}
                />
                <span className="min-w-0 flex-1 truncate">{w.name}</span>
                {w.kind && (
                  <span
                    className={
                      'shrink-0 rounded-full border px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide ' +
                      (w.kind === 'fs'
                        ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                        : 'border-border text-muted-foreground')
                    }
                  >
                    {w.kind === 'fs' ? 'FamilySearch' : t('workspace.kindManual')}
                  </span>
                )}
                {w.id === active.id && <Check className="h-4 w-4 shrink-0 text-primary" />}
              </DropdownMenuItem>
            ))}
            {shown.length === 0 && (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">—</p>
            )}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setCreating(true)} className="gap-2">
            <Plus className="h-4 w-4" /> {t('workspace.create')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setRenaming(true)} className="gap-2">
            <Pencil className="h-4 w-4" /> {t('workspace.rename')}
          </DropdownMenuItem>
          {list.length > 1 && (
            <DropdownMenuItem
              onClick={() => setDeleting(true)}
              className="gap-2 text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4" /> {t('workspace.delete')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <NameDialog
        open={creating}
        onOpenChange={setCreating}
        title={t('workspace.createTitle')}
        placeholder={t('workspace.namePlaceholder')}
        submitLabel={t('common.create')}
        onSubmit={create}
      />
      <NameDialog
        open={renaming}
        onOpenChange={setRenaming}
        title={t('workspace.renameTitle')}
        initial={active.name}
        placeholder={t('workspace.namePlaceholder')}
        submitLabel={t('common.save')}
        onSubmit={(v) => void rename(v)}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('workspace.deleteTitle', { name: active.name })}
        confirmLabel={t('workspace.delete')}
        onConfirm={remove}
      >
        {t('workspace.deleteConsequence')}
      </ConfirmDialog>
    </>
  )
}
