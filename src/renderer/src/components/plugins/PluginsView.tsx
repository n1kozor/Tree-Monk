import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink, Puzzle, ShieldCheck, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store/useAppStore'
import { localizedPluginText } from '@/lib/plugins'
import { PluginIcon } from '@/components/plugins/PluginIcon'
import type { InstalledPlugin, PluginScope } from '@shared/types'

/**
 * Full-page plugin manager (opened from the sidebar's Plugins flyout).
 * Installing goes through the step-by-step wizard; this page lists every
 * installed plugin with its consent badges, enable switch and removal.
 */

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return (
    <button
      onClick={() => onChange(!on)}
      className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', on ? 'bg-primary' : 'bg-secondary')}
    >
      <span
        className={cn(
          'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all',
          on ? 'left-[18px]' : 'left-0.5'
        )}
      />
    </button>
  )
}

const SCOPE_TONE: Record<PluginScope, string> = {
  read: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  write: 'bg-amber-500/20 text-amber-600 dark:text-amber-400',
  documents: 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
}

export function PluginsView(): JSX.Element {
  const { t, i18n } = useTranslation()
  const bumpPlugins = useAppStore((s) => s.bumpPlugins)
  const pluginsNonce = useAppStore((s) => s.pluginsNonce)
  const setPluginInstallOpen = useAppStore((s) => s.setPluginInstallOpen)
  const openPlugin = useAppStore((s) => s.openPlugin)
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([])

  const refresh = useCallback(async () => {
    const fn = window.api.plugins?.list
    setPlugins(fn ? await fn() : [])
  }, [])
  useEffect(() => {
    void refresh().catch(() => setPlugins([]))
  }, [refresh, pluginsNonce])

  const toggle = async (p: InstalledPlugin, enabled: boolean): Promise<void> => {
    setPlugins(await window.api.plugins.setEnabled(p.id, enabled))
    bumpPlugins()
  }

  const remove = async (p: InstalledPlugin): Promise<void> => {
    if (!window.confirm(t('plugins.removeConfirm', { name: p.name }))) return
    await window.api.plugins.remove(p.id)
    await refresh()
    bumpPlugins()
    toast.success(t('plugins.removed', { name: p.name }))
  }

  return (
    <div className="h-full overflow-y-auto" data-testid="plugins-view">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl border border-border bg-card">
            <Puzzle className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold leading-tight">{t('plugins.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('plugins.manageDesc')}</p>
          </div>
          <Button onClick={() => setPluginInstallOpen(true)} className="gap-2" data-testid="plugins-view-install">
            <Upload className="h-4 w-4" />
            {t('plugins.menuAdd')}
          </Button>
        </div>

        <p className="mb-4 flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          {t('plugins.securityNote')}
        </p>

        {plugins.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
            {t('plugins.none')}
          </p>
        ) : (
          <div className="space-y-3">
            {plugins.map((p) => (
              <div key={p.id} className="rounded-2xl border border-border bg-card p-4" data-testid={`plugin-card-${p.id}`}>
                <div className="flex items-center gap-3">
                  <PluginIcon pluginId={p.id} icon={p.icon} className="h-6 w-6 text-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {p.name}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        v{p.version}
                        {p.author ? ` · ${p.author}` : ''}
                      </span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {localizedPluginText(p.description, i18n.language)}
                    </p>
                  </div>
                  <Toggle on={p.enabled} onChange={(v) => void toggle(p, v)} />
                  <button
                    onClick={() => void remove(p)}
                    title={t('plugins.remove')}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-destructive transition-colors hover:bg-destructive/15"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  {p.permissions.map((s) => (
                    <span key={s} className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', SCOPE_TONE[s])}>
                      {t(`plugins.scope.${s}`)}
                    </span>
                  ))}
                  {p.permissions.length === 0 && (
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {t('plugins.scope.none')}
                    </span>
                  )}
                  <span className="ml-auto flex flex-wrap gap-1">
                    {p.enabled &&
                      p.menu.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => openPlugin(p.id, m.id)}
                          className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] text-foreground transition-colors hover:bg-accent"
                        >
                          {localizedPluginText(m.title, i18n.language)}
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      ))}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
