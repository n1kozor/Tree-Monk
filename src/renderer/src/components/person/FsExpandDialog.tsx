import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Info, Network } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store/useAppStore'

/**
 * "Pull in this person's environment" — deepen the tree AROUND one person:
 * their ancestors (up), descendants (down), spouses and collateral relatives,
 * to the chosen depth. Runs the same background import engine (minimizable
 * pill, tree grows live) with this person as the root, WITHOUT changing the
 * app's global starting person.
 */
export function FsExpandDialog({
  open,
  onOpenChange,
  personName,
  fid
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  personName: string
  fid: string
}): JSX.Element {
  const { t } = useTranslation()
  const startFsImport = useAppStore((s) => s.startFsImport)
  const [ascend, setAscend] = useState(3)
  const [descend, setDescend] = useState(2)
  const [maxPersons, setMaxPersons] = useState(2000)

  const run = (): void => {
    void startFsImport({ ascend, childrenDepth: descend, root: fid, maxPersons, keepRoot: true })
    onOpenChange(false)
  }

  const num = (v: string, min: number, max: number): number =>
    Math.max(min, Math.min(max, Number(v) || min))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8">
            <Network className="h-5 w-5 shrink-0 text-emerald-600" />
            <span>{t('fsExpand.title', { name: personName })}</span>
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">{t('fsExpand.intro', { name: personName })}</p>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">{t('fs.generations')}</p>
            <input
              type="number"
              min={0}
              max={99}
              value={ascend}
              onChange={(e) => setAscend(num(e.target.value, 0, 99))}
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
              onChange={(e) => setDescend(num(e.target.value, 0, 99))}
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
              onChange={(e) => setMaxPersons(num(e.target.value, 1, 100000))}
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
              <span className="font-medium text-foreground">{t('fsExpand.keepsRoot')}</span>
            </span>
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={run} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Network className="h-4 w-4" />
            {t('fsExpand.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
