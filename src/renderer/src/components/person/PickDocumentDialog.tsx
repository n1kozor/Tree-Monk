import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DocumentThumb } from '@/components/documents/DocumentThumb'
import { useAppStore } from '@/store/useAppStore'

/**
 * Link an EXISTING document from the general library to this person. Shows every
 * document NOT already attached to the person; clicking one attaches it (and it
 * drops out of the list on refresh). Stays open so several can be linked in a row.
 */
export function PickDocumentDialog({
  open,
  onClose,
  personId,
  onPicked
}: {
  open: boolean
  onClose: () => void
  personId: string
  onPicked: () => Promise<void> | void
}): JSX.Element {
  const { t } = useTranslation()
  const documents = useAppStore((s) => s.documents)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)

  const available = useMemo(() => {
    const pool = documents.filter((d) => !d.personIds.includes(personId))
    const needle = q.trim().toLowerCase()
    if (!needle) return pool
    return pool.filter((d) => `${d.title} ${d.filePath}`.toLowerCase().includes(needle))
  }, [documents, personId, q])

  const pick = async (docId: string): Promise<void> => {
    setBusy(true)
    await window.api.documents.attach(docId, personId)
    setBusy(false)
    await onPicked()
  }

  const close = (): void => {
    setQ('')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && close()}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>{t('attach.pickTitle')}</DialogTitle>
        </DialogHeader>
        <p className="-mt-1 text-xs text-muted-foreground">{t('attach.pickSubtitle')}</p>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('documents.search')}
            className="pl-8"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-1 pr-1">
          {available.length === 0 ? (
            <p className="px-2 py-10 text-center text-xs text-muted-foreground">{t('attach.pickEmpty')}</p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2.5">
              {available.map((d) => (
                <DocumentThumb key={d.id} doc={d} onClick={() => void pick(d.id)} />
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={close} disabled={busy}>
            {t('attach.done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
