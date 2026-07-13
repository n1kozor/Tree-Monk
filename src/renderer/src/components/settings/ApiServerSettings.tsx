import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BookOpen, Copy, Eye, EyeOff, Plug, RefreshCw, Bot } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { ApiServerConfig, ApiServerStatus } from '@shared/types'

/**
 * Settings card for the local API + MCP server. Everything is opt-in: the
 * server binds to 127.0.0.1 only, every request needs the Bearer token below,
 * and writes have their own switch. Docs are served by the app itself at /docs.
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

export function ApiServerSettings(): JSX.Element | null {
  const { t } = useTranslation()
  const [cfg, setCfg] = useState<ApiServerConfig | null>(null)
  const [status, setStatus] = useState<ApiServerStatus | null>(null)
  const [showToken, setShowToken] = useState(false)
  const [port, setPort] = useState('')

  const refresh = useCallback(async () => {
    const [c, s] = await Promise.all([window.api.apiServer.getConfig(), window.api.apiServer.status()])
    setCfg(c)
    setStatus(s)
    setPort(String(c.port))
  }, [])
  useEffect(() => {
    void refresh().catch(() => setCfg(null))
  }, [refresh])

  if (!cfg) return null // demo build / API unavailable

  const patch = async (p: Partial<Omit<ApiServerConfig, 'token'>>): Promise<void> => {
    try {
      await window.api.apiServer.setConfig(p)
      // The server restarts async — give it a beat before reading the status.
      setTimeout(() => void refresh(), 300)
    } catch {
      toast.error(t('settings.api.error'))
    }
  }

  const copy = (text: string): void => {
    void navigator.clipboard.writeText(text)
    toast.success(t('settings.api.copied'))
  }

  const base = `http://127.0.0.1:${cfg.port}`

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2.5 border-b border-border/60 bg-muted/30 px-4 py-3">
        <div className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10">
          <Plug className="h-4 w-4 text-primary" />
        </div>
        <h3 className="text-sm font-semibold">{t('settings.api.title')}</h3>
        <span
          className={cn(
            'ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
            status?.running
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              : status?.error
                ? 'bg-destructive/15 text-destructive'
                : 'bg-secondary text-muted-foreground'
          )}
        >
          {status?.running
            ? t('settings.api.running', { port: status.port })
            : status?.error
              ? `${t('settings.api.failed')}: ${status.error}`
              : t('settings.api.stopped')}
        </span>
      </div>

      <div className="divide-y divide-border/50">
        {/* Enable */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{t('settings.api.enable')}</p>
            <p className="text-xs text-muted-foreground">{t('settings.api.enableDesc')}</p>
          </div>
          <Toggle on={cfg.enabled} onChange={(v) => void patch({ enabled: v })} />
        </div>

        {cfg.enabled && (
          <>
            {/* Port */}
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t('settings.api.port')}</p>
              </div>
              <input
                value={port}
                onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))}
                onBlur={() => {
                  const n = Number(port)
                  if (n >= 1024 && n <= 65535 && n !== cfg.port) void patch({ port: n })
                  else setPort(String(cfg.port))
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                className="h-8 w-24 rounded-lg border border-input bg-background/40 px-2 text-right text-sm tabular-nums outline-none focus:border-primary/60"
              />
            </div>

            {/* Token */}
            <div className="space-y-1.5 px-4 py-3">
              <p className="text-sm font-medium">{t('settings.api.token')}</p>
              <p className="text-xs text-muted-foreground">{t('settings.api.tokenDesc')}</p>
              <div className="flex items-center gap-1.5">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-secondary/50 px-2 py-1.5 text-xs">
                  {showToken ? cfg.token : '•'.repeat(24)}
                </code>
                <button
                  onClick={() => setShowToken((v) => !v)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                  title={showToken ? t('settings.api.hide') : t('settings.api.show')}
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => copy(cfg.token)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                  title={t('settings.api.copy')}
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    void window.api.apiServer.regenerateToken().then(() => {
                      toast.success(t('settings.api.regenerated'))
                      void refresh()
                    })
                  }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-destructive"
                  title={t('settings.api.regenerate')}
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Writes */}
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t('settings.api.writes')}</p>
                <p className="text-xs text-muted-foreground">{t('settings.api.writesDesc')}</p>
              </div>
              <Toggle on={cfg.allowWrites} onChange={(v) => void patch({ allowWrites: v })} />
            </div>

            {/* MCP */}
            <div className="flex items-center gap-3 px-4 py-3">
              <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t('settings.api.mcp')}</p>
                <p className="text-xs text-muted-foreground">{t('settings.api.mcpDesc')}</p>
                {cfg.mcpEnabled && (
                  <button
                    onClick={() => copy(`${base}/mcp`)}
                    className="mt-1 flex max-w-full items-center gap-1 truncate rounded bg-secondary/50 px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    <Copy className="h-3 w-3 shrink-0" /> {base}/mcp
                  </button>
                )}
              </div>
              <Toggle on={cfg.mcpEnabled} onChange={(v) => void patch({ mcpEnabled: v })} />
            </div>

            {/* Docs */}
            <div className="flex items-center gap-3 px-4 py-3">
              <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t('settings.api.docs')}</p>
                <p className="text-xs text-muted-foreground">{t('settings.api.docsDesc')}</p>
              </div>
              <button
                onClick={() => void window.api.app.openExternal(`${base}/docs`)}
                disabled={!status?.running}
                className="rounded-lg border border-border/60 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
              >
                {base}/docs
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
