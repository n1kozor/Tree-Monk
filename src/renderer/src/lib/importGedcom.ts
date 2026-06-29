import { toast } from 'sonner'
import type { TFunction } from 'i18next'
import type { GedcomImportResult } from '@shared/types'

/**
 * Runs a GEDCOM import with a persistent "Importing…" toast so a big file (the
 * parse + insert runs synchronously in the main process and can take a while)
 * never looks like a frozen app. The renderer is a separate process, so the
 * spinner keeps animating while the main process works. Returns the result, or
 * null when the user cancelled the file picker / the import failed — the caller
 * does its own post-import work (refresh, media download, place standardization).
 */
export async function importGedcomWithToast(t: TFunction): Promise<GedcomImportResult | null> {
  const id = toast.loading(t('gedcom.importing'), { description: t('gedcom.importingHint') })
  try {
    const res = await window.api.gedcom.import()
    if (!res) {
      toast.dismiss(id)
      return null
    }
    toast.success(
      t('gedcom.importedDetail', {
        created: res.peopleCreated ?? res.people,
        updated: res.peopleUpdated ?? 0,
        families: res.families
      }),
      { id }
    )
    return res
  } catch {
    toast.error(t('gedcom.importError'), { id })
    return null
  }
}
