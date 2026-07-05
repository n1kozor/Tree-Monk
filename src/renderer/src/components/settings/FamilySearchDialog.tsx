import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { TreeDeciduous, LogIn, Download, Loader2, CheckCircle2, Info, AlertTriangle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store/useAppStore'
import { setFsMode } from '@/lib/fsMode'

/**
 * FamilySearch hub: sign in on FamilySearch's own page (system browser, no
 * password handling), then import your tree from the official API. Contribution
 * (write-back) lives on each person's profile.
 */
export function FamilySearchDialog({
  open,
  onOpenChange,
  mandatory = false
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Start-flow (new tree / wipe): the dialog CANNOT be dismissed to an empty
   *  dashboard — the user must import, or explicitly switch to Manual mode. */
  mandatory?: boolean
}): JSX.Element {
  const { t, i18n } = useTranslation()
  const refreshAll = useAppStore((s) => s.refreshAll)
  const startFsImport = useAppStore((s) => s.startFsImport)
  const setView = useAppStore((s) => s.setView)
  const [configured, setConfigured] = useState(true)
  const [signedIn, setSignedIn] = useState(false)
  const [busy, setBusy] = useState<'signin' | 'import' | null>(null)
  const [ascend, setAscend] = useState(4)
  const [descend, setDescend] = useState(2)
  const [maxPersons, setMaxPersons] = useState(5000)
  const [trees, setTrees] = useState<{ id: string; name: string; kind: 'global' | 'user' }[]>([])
  const [treeId, setTreeId] = useState('GLOBAL')
  const [rootFid, setRootFid] = useState('')
  const [rootCheck, setRootCheck] = useState<
    { status: 'idle' | 'checking' | 'found' | 'notfound'; name?: string; lifespan?: string }
  >({ status: 'idle' })
  const bailed = useRef(false)

  // Deliberate escape hatch: leave the mandatory FS flow for a usable Manual
  // tree (never trap the user on an empty dashboard).
  // Verify the entered starting person id (debounced) so the user can confirm
  // exactly who the import will start from.
  useEffect(() => {
    const id = rootFid.trim()
    if (!id) {
      setRootCheck({ status: 'idle' })
      return
    }
    setRootCheck({ status: 'checking' })
    const h = setTimeout(() => {
      void window.api.familysearch.lookupPerson(id, treeId).then((r) => {
        setRootCheck(
          r.found ? { status: 'found', name: r.name, lifespan: r.lifespan } : { status: 'notfound' }
        )
      })
    }, 500)
    return () => clearTimeout(h)
  }, [rootFid, treeId])

  const switchToManual = (): void => {
    setFsMode(false)
    bailed.current = true
    onOpenChange(false)
  }

  useEffect(() => {
    if (!open) return
    void window.api.familysearch.configured().then(setConfigured)
    void window.api.familysearch.signedIn().then((si) => {
      setSignedIn(si)
      if (si) void window.api.familysearch.listTrees().then(setTrees)
    })
  }, [open])

  const signIn = async (): Promise<void> => {
    setBusy('signin')
    try {
      const r = await window.api.familysearch.login(i18n.language)
      if (r.ok) {
        setSignedIn(true)
        setFsMode(true)
        // Now that we're signed in, load the user's trees for the selector.
        void window.api.familysearch.listTrees().then(setTrees)
        window.dispatchEvent(new Event('fs-auth-changed'))
        toast.success(t('fs.signedIn'))
      } else if (r.error === 'NO_CLIENT_ID') toast.error(t('fs.noClientId'))
      else if (r.error !== 'CANCELLED') toast.error(t('fs.loginFailed'))
    } finally {
      setBusy(null)
    }
  }

  const signOut = async (): Promise<void> => {
    await window.api.familysearch.signOut()
    setSignedIn(false)
    window.dispatchEvent(new Event('fs-auth-changed'))
  }

  const runImport = (): void => {
    // Kick off in the background (store) so it survives closing the dialog,
    // switch to the tree, and let the user watch it grow via the pill.
    void startFsImport({ ascend, childrenDepth: descend, treeId, root: rootFid.trim() || undefined, maxPersons })
    setView('tree')
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (busy === 'signin') return
        // In the start flow, block every dismissal (X / Esc / outside click) so
        // a failed login never drops the user onto an empty dashboard.
        if (!v && mandatory && !bailed.current) return
        onOpenChange(v)
      }}
    >
      <DialogContent
        className="max-w-md"
        hideClose={mandatory}
        onEscapeKeyDown={(e) => mandatory && !bailed.current && e.preventDefault()}
        onInteractOutside={(e) => mandatory && !bailed.current && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8">
            <TreeDeciduous className="h-5 w-5 shrink-0 text-emerald-600" />
            <span>{t('fs.title')}</span>
          </DialogTitle>
        </DialogHeader>

        {!configured ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t('fs.noClientId')}</span>
          </div>
        ) : !signedIn ? (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-muted-foreground">{t('fs.signInHelp')}</p>
            <Button onClick={() => void signIn()} disabled={busy !== null} className="w-full gap-2">
              {busy === 'signin' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              {t('fs.signInBtn')}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span className="flex-1">{t('fs.connected')}</span>
              <button
                onClick={() => void signOut()}
                className="text-xs underline opacity-70 transition-opacity hover:opacity-100"
              >
                {t('fs.signOut')}
              </button>
            </div>

            <div className="space-y-1.5">
                <p className="text-sm font-medium">{t('fs.startPerson')}</p>
                <input
                  value={rootFid}
                  onChange={(e) => setRootFid(e.target.value.toUpperCase())}
                  disabled={busy !== null}
                  placeholder={t('fs.startPersonPlaceholder')}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm uppercase focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                {rootCheck.status === 'checking' && (
                  <p className="text-xs text-muted-foreground">{t('fs.startChecking')}</p>
                )}
                {rootCheck.status === 'found' && (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {rootCheck.name}
                    {rootCheck.lifespan ? ` · ${rootCheck.lifespan}` : ''}
                  </p>
                )}
                {rootCheck.status === 'notfound' && (
                  <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{t('fs.startNotFound')}</p>
                )}
                <p className="text-xs text-muted-foreground">{t('fs.startPersonHint')}</p>
              </div>

            {trees.length > 1 && (
              <div className="space-y-1.5">
                <p className="text-sm font-medium">{t('fs.chooseTree')}</p>
                <select
                  value={treeId}
                  onChange={(e) => setTreeId(e.target.value)}
                  disabled={busy !== null}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {trees.map((tr) => (
                    <option key={tr.id} value={tr.id}>
                      {tr.kind === 'global' ? t('fs.mainTree') : tr.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className="text-sm font-medium">{t('fs.generations')}</p>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={ascend}
                  disabled={busy !== null}
                  onChange={(e) => setAscend(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">{t('fs.descendGenerations')}</p>
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={descend}
                  disabled={busy !== null}
                  onChange={(e) => setDescend(Math.max(0, Math.min(99, Number(e.target.value) || 0)))}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <p className="text-sm font-medium">{t('fs.maxPersons')}</p>
                <input
                  type="number"
                  min={1}
                  max={100000}
                  step={500}
                  value={maxPersons}
                  disabled={busy !== null}
                  onChange={(e) => setMaxPersons(Math.max(1, Math.min(100000, Number(e.target.value) || 1)))}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              {(ascend >= 7 || descend >= 5) && (
                <p className="col-span-2 flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{t('fs.depthWarning', { max: maxPersons })}</span>
                </p>
              )}
              <p className="col-span-2 flex items-start gap-1.5 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {t('fs.ancExplain', { n: ascend })}
                  <br />
                  {t('fs.descExplain', { n: descend })}
                  <br />
                  <span className="font-medium text-foreground">{t('fs.alwaysIncluded')}</span>
                  <br />
                  {t('fs.priorityNote')}
                </span>
              </p>
            </div>

            <Button
              onClick={runImport}
              disabled={busy !== null || rootCheck.status === 'checking' || rootCheck.status === 'notfound'}
              className="w-full gap-2"
            >
              <Download className="h-4 w-4" />
              {t('fs.importBtn')}
            </Button>
            <p className="text-center text-xs text-muted-foreground">{t('fsImport.hint')}</p>
          </div>
        )}

        {mandatory && (
          <button
            onClick={switchToManual}
            className="mx-auto mt-1 text-xs text-muted-foreground underline underline-offset-2 transition-opacity hover:opacity-100 hover:text-foreground"
          >
            {t('fs.useManualInstead')}
          </button>
        )}
      </DialogContent>
    </Dialog>
  )
}
