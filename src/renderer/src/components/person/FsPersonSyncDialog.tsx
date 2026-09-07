import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ArrowRight, Baby, Heart, Loader2, LogIn, RefreshCw, Sparkles, Trash2, UserPlus, Users } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toastUndo } from '@/components/common/ConfirmDialog'
import type { PersonSnapshot } from '@shared/types'

interface FieldDiff {
  field: string
  local: string | null
  remote: string | null
}
interface Relative {
  fid: string
  name: string
  kind: 'spouse' | 'child' | 'parent' | 'godparent'
}
type Counts = Record<'notes' | 'sources' | 'media' | 'occupations' | 'events', { local: number; remote: number }>

const KIND_ICON = { spouse: Heart, child: Baby, parent: Users, godparent: Sparkles } as const

/**
 * One-person FamilySearch refresh with a full preview: which fields change,
 * which NEW relatives were found on FamilySearch (spouse/child/parent/
 * godparent), and how much extra content (notes/sources/photos/occupations)
 * comes along. Nothing happens until the user confirms.
 */
export function FsPersonSyncDialog({
  open,
  onOpenChange,
  personId,
  fid,
  onApplied
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  personId: string
  fid: string
  onApplied: () => void | Promise<void>
}): JSX.Element {
  const { t, i18n } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [fields, setFields] = useState<FieldDiff[]>([])
  const [relatives, setRelatives] = useState<Relative[]>([])
  const [content, setContent] = useState<Counts | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [remoteChange, setRemoteChange] = useState<{ kind: 'deleted' | 'merged'; forwardedFid?: string } | null>(null)
  const [signedOut, setSignedOut] = useState(false)
  const [signingIn, setSigningIn] = useState(false)

  const load = (): void => {
    setFields([])
    setRelatives([])
    setContent(null)
    setError(null)
    setRemoteChange(null)
    setSignedOut(false)
    setLoading(true)
    void window.api.familysearch
      .syncPreview(personId)
      .then((r) => {
        if ('error' in r) {
          if (r.error === 'NOT_SIGNED_IN') {
            setSignedOut(true)
            setError(t('fs.signInFirst'))
          } else if (r.error === 'FS_DELETED' || r.error === 'FS_MERGED') {
            setRemoteChange({ kind: r.error === 'FS_DELETED' ? 'deleted' : 'merged', forwardedFid: r.forwardedFid })
          } else {
            setError(t('fs.diffFailed'))
          }
        } else {
          setFields(r.fields)
          setRelatives(r.newRelatives)
          setContent(r.content)
        }
      })
      .catch(() => setError(t('fs.diffFailed')))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!open) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, personId])

  /** Sign in right here (system-browser OAuth), then reload the preview. */
  const signIn = async (): Promise<void> => {
    setSigningIn(true)
    try {
      const r = await window.api.familysearch.login(i18n.language)
      if (r.ok) load()
      else toast.error(t('fs.loginFailed'))
    } finally {
      setSigningIn(false)
    }
  }

  const fieldLabel = (f: string): string => t(`fs.f_${f}`, { defaultValue: f })
  const newContent = content
    ? (Object.entries(content) as [keyof Counts, { local: number; remote: number }][]).filter(
        ([, v]) => v.remote > v.local
      )
    : []
  const hasChanges = !!remoteChange || fields.length > 0 || relatives.length > 0 || newContent.length > 0

  const apply = async (): Promise<void> => {
    setApplying(true)
    try {
      const r = await window.api.familysearch.syncPerson(fid)
      if ('needCreds' in r) {
        toast.error(t('fs.signInFirst'))
        return
      }
      if (r.status === 'deleted') {
        const snapshot = r.snapshot as PersonSnapshot | null | undefined
        if (!snapshot) {
          toast.error(t('fs.syncNotFound'))
          return
        }
        await onApplied()
        toastUndo(t('fs.localDeleted'), t('common.undo'), async () => {
          await window.api.people.restore(snapshot)
          await onApplied()
        })
      } else if (r.status === 'merged' && r.found) {
        toast.success(t('fs.localMerged'))
        await onApplied()
      } else if (!r.found) {
        toast.error(t('fs.syncNotFound'))
        return
      } else {
        const rels = r.addedRelatives?.length ?? 0
        toast.success(rels > 0 ? t('fs.syncedWithRelatives', { count: rels }) : t('fs.syncedChanged'))
        await onApplied()
      }
      onOpenChange(false)
    } finally {
      setApplying(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (applying ? undefined : onOpenChange(v))}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8">
            <RefreshCw className="h-5 w-5 shrink-0 text-emerald-600" />
            <span>{t('fs.pullTitle')}</span>
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">{t('fs.pullIntro')}</p>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t('fs.diffLoading')}
          </div>
        ) : error ? (
          <div className="space-y-3">
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
            {signedOut && (
              <Button onClick={() => void signIn()} disabled={signingIn} className="w-full gap-2">
                {signingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                {signingIn ? t('fs.signingIn') : t('fs.signInNow')}
              </Button>
            )}
          </div>
        ) : remoteChange ? (
          <div className="space-y-3 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm">
            <div className="flex items-start gap-2">
              <Trash2 className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <p>
                {remoteChange.kind === 'deleted'
                  ? t('fs.remoteDeletedApply')
                  : t('fs.remoteMergedApply', { fid: remoteChange.forwardedFid ?? fid })}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">{t('fs.remoteChangeHint')}</p>
          </div>
        ) : !hasChanges ? (
          <p className="rounded-lg border border-border bg-muted/40 p-3 text-center text-sm text-muted-foreground">
            {t('fs.noChanges')}
          </p>
        ) : (
          <div className="max-h-80 space-y-4 overflow-y-auto pr-1">
            {fields.length > 0 && (
              <section className="space-y-1.5">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('fs.secFields')}
                </h4>
                {fields.map((r) => (
                  <div key={r.field} className="rounded-lg border border-border px-3 py-2 text-sm">
                    <div className="text-xs font-medium text-muted-foreground">{fieldLabel(r.field)}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-muted-foreground line-through decoration-rose-400/60">
                        {r.local ?? t('fs.empty')}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">{r.remote}</span>
                    </div>
                  </div>
                ))}
              </section>
            )}

            {relatives.length > 0 && (
              <section className="space-y-1.5">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('fs.secRelatives')}
                </h4>
                {relatives.map((r) => {
                  const Icon = KIND_ICON[r.kind] ?? UserPlus
                  return (
                    <div
                      key={`${r.kind}:${r.fid}`}
                      className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-emerald-600" />
                      <span className="font-medium">{r.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{t(`fs.kind_${r.kind}`)}</span>
                    </div>
                  )
                })}
              </section>
            )}

            {newContent.length > 0 && (
              <section className="space-y-1.5">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('fs.secContent')}
                </h4>
                {newContent.map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                    <span>{t(`fs.c_${k}`)}</span>
                    <span className="ml-auto font-medium text-emerald-700 dark:text-emerald-400">
                      {v.local} → {v.remote}
                    </span>
                  </div>
                ))}
              </section>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applying}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => void apply()}
            disabled={applying || loading || !!error || !hasChanges}
            className="gap-2"
          >
            {applying && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('fs.applyPull')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
