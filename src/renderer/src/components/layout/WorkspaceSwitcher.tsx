import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { clearStartChoice } from '@/lib/fsMode'
import { Check, ChevronDown, Pencil, Plus, Trash2, TreePine } from 'lucide-react'
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

/**
 * The prominent "mandant" picker in the top bar: shows the active family tree
 * and lets the user switch, create, rename or delete trees. Switching/creating
 * relaunches the app (handled in main) so every cache opens the new database.
 */
export function WorkspaceSwitcher(): JSX.Element | null {
  const { t } = useTranslation()
  const [list, setList] = useState<Workspace[]>([])
  const [active, setActive] = useState<Workspace | null>(null)
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)

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

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="glass-subtle flex max-w-[15rem] items-center gap-2 rounded-xl px-3 py-1.5 text-left transition-colors hover:bg-accent">
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
        <DropdownMenuContent align="start" className="min-w-[15rem]">
          <DropdownMenuLabel>{t('workspace.switch')}</DropdownMenuLabel>
          {list.map((w) => (
            <DropdownMenuItem key={w.id} onClick={() => switchTo(w.id)} className="gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: w.color }}
              />
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              {w.id === active.id && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </DropdownMenuItem>
          ))}
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
