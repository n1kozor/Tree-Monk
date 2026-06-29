import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  ChevronsDown,
  ChevronsUp,
  Download,
  Globe,
  Heart,
  Network,
  type LucideIcon
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RootPicker } from '@/components/tree/RootPicker'
import { useAppStore } from '@/store/useAppStore'
import { scopePeople, type DashboardScope } from '@/lib/dashboardScope'
import { cn, fullName } from '@/lib/utils'
import { safeFileBase } from '@/lib/fileName'

const SCOPES: { id: DashboardScope; icon: LucideIcon; descKey: string }[] = [
  { id: 'all', icon: Globe, descKey: 'gedcom.scopeAllDesc' },
  { id: 'blood', icon: Network, descKey: 'gedcom.scopeBloodDesc' },
  { id: 'ancestors', icon: ChevronsUp, descKey: 'gedcom.scopeAncestorsDesc' },
  { id: 'descendants', icon: ChevronsDown, descKey: 'gedcom.scopeDescendantsDesc' }
]

/**
 * GEDCOM export with options. The key feature: pick ANY starting person (not
 * just the tree's root) and a scope around them, so you can export, say, only a
 * cousin's bloodline to send to that cousin.
 */
export function ExportGedcomDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}): JSX.Element {
  const { t } = useTranslation()
  const people = useAppStore((s) => s.people)
  const families = useAppStore((s) => s.families)
  const defaultRootId = useAppStore((s) => s.defaultRootId)
  const treeRootId = useAppStore((s) => s.treeRootId)

  const [scope, setScope] = useState<DashboardScope>('all')
  const [rootId, setRootId] = useState<string | undefined>(undefined)
  const [includeSpouses, setIncludeSpouses] = useState(true)
  const [busy, setBusy] = useState(false)
  const [fileName, setFileName] = useState('')
  const [nameEdited, setNameEdited] = useState(false)

  // Default the starting person to the app's "me" each time the dialog opens.
  useEffect(() => {
    if (open) setRootId(defaultRootId ?? treeRootId)
  }, [open, defaultRootId, treeRootId])

  // Suggested file name = the starting person's name, when one is known.
  const startPerson = rootId ? people.find((p) => p.id === rootId) : undefined
  const suggestedName = useMemo(() => {
    const name = startPerson ? fullName(startPerson) : ''
    return safeFileBase(name && name !== '—' ? name : 'treemonk-export')
  }, [startPerson])

  // Reset the "user typed their own name" flag whenever the dialog opens, then
  // keep the field in sync with the starting person until they edit it by hand.
  useEffect(() => {
    if (open) setNameEdited(false)
  }, [open])
  useEffect(() => {
    if (!nameEdited) setFileName(suggestedName)
  }, [suggestedName, nameEdited])

  const needsRoot = scope !== 'all'
  const scoped = useMemo(
    () => scopePeople(people, families, { scope, rootId, includeSpouses }),
    [people, families, scope, rootId, includeSpouses]
  )
  const count = scope === 'all' ? people.length : scoped.root ? scoped.people.length : 0
  const canExport = !needsRoot || (!!rootId && !!scoped.root)

  const doExport = async (): Promise<void> => {
    if (!canExport || busy) return
    setBusy(true)
    // 'all' → no filter (export everyone); otherwise the resolved scope ids.
    const ids = scope === 'all' ? undefined : [...scoped.ids]
    const res = await window.api.gedcom.export(ids, safeFileBase(fileName))
    setBusy(false)
    if (res) {
      toast.success(t('gedcom.exported', { path: res.path }))
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-4 w-4 text-primary" />
            {t('gedcom.exportTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">{t('gedcom.exportSubtitle')}</p>

          {/* Scope picker */}
          <div className="space-y-1.5">
            <Label>{t('gedcom.exportScope')}</Label>
            <div className="grid grid-cols-2 gap-2">
              {SCOPES.map(({ id, icon: Icon, descKey }) => (
                <button
                  key={id}
                  onClick={() => setScope(id)}
                  className={cn(
                    'flex flex-col gap-1 rounded-lg border p-2.5 text-left transition-colors',
                    scope === id
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-accent'
                  )}
                >
                  <span
                    className={cn(
                      'flex items-center gap-1.5 text-sm font-medium',
                      scope === id ? 'text-primary' : 'text-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {t(`dashboard.scope.${id}`)}
                  </span>
                  <span className="text-[11px] leading-snug text-muted-foreground">{t(descKey)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Starting person — only relevant when the scope is relative to someone. */}
          {needsRoot && (
            <div className="space-y-1.5">
              <Label>{t('gedcom.exportRoot')}</Label>
              <RootPicker rootId={rootId} onPick={setRootId} flat />
              <p className="text-[11px] leading-snug text-muted-foreground">{t('gedcom.exportRootHint')}</p>
              {!scoped.root && (
                <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                  {t('gedcom.exportNeedRoot')}
                </p>
              )}
            </div>
          )}

          {/* Include married-in spouses */}
          {needsRoot && (
            <button
              onClick={() => setIncludeSpouses((v) => !v)}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                includeSpouses
                  ? 'border-rose-500/50 bg-rose-500/10'
                  : 'border-border hover:bg-accent'
              )}
            >
              <Heart
                className={cn(
                  'h-4 w-4 shrink-0',
                  includeSpouses ? 'fill-current text-rose-500' : 'text-muted-foreground'
                )}
              />
              <span className="flex-1">
                <span className="font-medium">{t('dashboard.includeSpouses')}</span>
                <span className="block text-[11px] text-muted-foreground">{t('gedcom.exportIncludeSpousesHint')}</span>
              </span>
            </button>
          )}

          {/* File name — pre-filled from the starting person, editable here. */}
          <div className="space-y-1.5">
            <Label>{t('gedcom.exportFileName')}</Label>
            <div className="flex items-center gap-2">
              <Input
                value={fileName}
                onChange={(e) => {
                  setNameEdited(true)
                  setFileName(e.target.value)
                }}
                placeholder="treemonk-export"
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground">.ged</span>
            </div>
          </div>

          {/* Live count */}
          <div className="rounded-lg bg-secondary/50 py-2 text-center text-sm text-muted-foreground">
            {t('gedcom.exportCount', { count })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" className="gap-1.5" onClick={doExport} disabled={busy || !canExport || count === 0}>
            <Download className="h-4 w-4" />
            {t('gedcom.exportBtn')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Label({ children }: { children: React.ReactNode }): JSX.Element {
  return <p className="text-xs font-medium text-muted-foreground">{children}</p>
}
