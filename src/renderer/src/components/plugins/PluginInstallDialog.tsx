import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, FileArchive, Languages, Palette, ShieldCheck, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store/useAppStore'
import { localizedPluginText } from '@/lib/plugins'
import { PluginIcon } from '@/components/plugins/PluginIcon'
import type { InstalledPlugin, PluginScope } from '@shared/types'

/**
 * Step-by-step plugin install wizard: (1) what a plugin must bring, (2) pick
 * the zip — a rejected manifest shows the validator's EXACT reason so plugin
 * authors know what to fix, (3) review the manifest + enable.
 */

const SCOPE_TONE: Record<PluginScope, string> = {
  read: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  write: 'bg-amber-500/20 text-amber-600 dark:text-amber-400',
  documents: 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
}

/** IPC rejections arrive as "Error invoking remote method '…': Error: <msg>". */
function ipcMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  return raw.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '')
}

export function PluginInstallDialog(): JSX.Element {
  const { t, i18n } = useTranslation()
  const open = useAppStore((s) => s.pluginInstallOpen)
  const setOpen = useAppStore((s) => s.setPluginInstallOpen)
  const bumpPlugins = useAppStore((s) => s.bumpPlugins)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [error, setError] = useState<string | null>(null)
  const [installed, setInstalled] = useState<InstalledPlugin | null>(null)
  const [busy, setBusy] = useState(false)

  const close = (v: boolean): void => {
    setOpen(v)
    if (!v) {
      setStep(1)
      setError(null)
      setInstalled(null)
    }
  }

  const pick = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const result = await window.api.plugins.install()
      if (result) {
        setInstalled(result)
        setStep(3)
        bumpPlugins()
      }
    } catch (e) {
      setError(ipcMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const enableNow = async (): Promise<void> => {
    if (!installed) return
    await window.api.plugins.setEnabled(installed.id, true)
    bumpPlugins()
    toast.success(t('plugins.wizard.enabled', { name: installed.name }))
    close(false)
  }

  const req = (icon: JSX.Element, text: string): JSX.Element => (
    <li className="flex items-start gap-2.5 rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm">
      <span className="mt-0.5 shrink-0 text-primary">{icon}</span>
      <span>{text}</span>
    </li>
  )

  return (
    <Dialog open={open} onOpenChange={close}>
      {/* Solid (a bright plugin card behind must not shine through the glass) +
          overflow-hidden so nothing spills past the rounded box. Grid cells
          default to min-width:auto, so every step wrapper also gets min-w-0. */}
      <DialogContent className="max-w-xl overflow-hidden bg-card" data-testid="plugin-install-dialog">
        <DialogHeader className="min-w-0">
          <DialogTitle>{t('plugins.wizard.title')}</DialogTitle>
        </DialogHeader>

        {/* Step dots */}
        <div className="flex items-center gap-1.5">
          {[1, 2, 3].map((s) => (
            <span
              key={s}
              className={cn('h-1.5 rounded-full transition-all', s === step ? 'w-6 bg-primary' : 'w-3 bg-secondary')}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="min-w-0 space-y-3">
            <p className="text-sm text-muted-foreground">{t('plugins.wizard.step1Intro')}</p>
            <ul className="space-y-2">
              {req(<ShieldCheck className="h-4 w-4" />, t('plugins.wizard.reqSandbox'))}
              {req(<Languages className="h-4 w-4" />, t('plugins.wizard.reqLangs'))}
              {req(<Palette className="h-4 w-4" />, t('plugins.wizard.reqTheme'))}
              {req(<FileArchive className="h-4 w-4" />, t('plugins.wizard.reqZip'))}
            </ul>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => close(false)}>
                {t('plugins.wizard.cancel')}
              </Button>
              <Button onClick={() => setStep(2)} data-testid="plugin-wizard-next">
                {t('plugins.wizard.next')}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="min-w-0 space-y-3">
            <p className="text-sm text-muted-foreground">{t('plugins.wizard.step2Intro')}</p>
            {error && (
              <div className="space-y-1.5 rounded-xl border border-destructive/40 bg-destructive/10 p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
                  <XCircle className="h-4 w-4 shrink-0" />
                  {t('plugins.wizard.errorTitle')}
                </p>
                {/* The validator's exact reason — this is FOR the plugin author. */}
                <p className="break-words font-mono text-xs text-destructive/90" data-testid="plugin-wizard-error">
                  {error}
                </p>
                <p className="text-xs text-muted-foreground">{t('plugins.wizard.errorHint')}</p>
              </div>
            )}
            <div className="flex justify-between gap-2 pt-1">
              <Button variant="ghost" onClick={() => setStep(1)}>
                {t('plugins.wizard.back')}
              </Button>
              <Button onClick={() => void pick()} disabled={busy} data-testid="plugin-wizard-pick">
                <FileArchive className="mr-2 h-4 w-4" />
                {busy ? '…' : t('plugins.wizard.pick')}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && installed && (
          <div className="min-w-0 space-y-3">
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {t('plugins.wizard.successTitle')}
            </p>
            <div className="rounded-xl border border-border bg-secondary/40 p-3">
              <div className="flex items-center gap-2.5">
                <PluginIcon pluginId={installed.id} icon={installed.icon} className="h-5 w-5 text-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold" title={installed.name}>
                    {installed.name}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      v{installed.version}
                      {installed.author ? ` · ${installed.author}` : ''}
                    </span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {localizedPluginText(installed.description, i18n.language)}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {installed.permissions.map((s) => (
                  <span key={s} className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', SCOPE_TONE[s])}>
                    {t(`plugins.scope.${s}`)}
                  </span>
                ))}
                {installed.permissions.length === 0 && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {t('plugins.scope.none')}
                  </span>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t('plugins.wizard.successBody')}</p>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => close(false)}>
                {t('plugins.wizard.later')}
              </Button>
              <Button onClick={() => void enableNow()} data-testid="plugin-wizard-enable">
                {t('plugins.wizard.enableNow')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
