import { toast } from 'sonner'
import type { TFunction } from 'i18next'

/**
 * Runs the canonical place-name standardization across the whole tree, showing a
 * live progress toast. Used by the Settings button and automatically after an
 * import. Safe to fire-and-forget; offline it simply finds nothing to change.
 */
export async function runPlaceStandardization(
  t: TFunction,
  onDone?: () => Promise<void> | void,
  onlyNew = false
): Promise<void> {
  const id = 'place-standardize'
  toast.loading(t('places.standardizing'), { id, description: t('places.standardizingHint') })
  const unsub = window.api.geo.onStandardizeProgress((p) => {
    toast.loading(t('places.standardizing'), {
      id,
      description: t('places.progress', { done: p.done, total: p.total, changed: p.changed })
    })
  })
  try {
    const res = await window.api.geo.standardizeAll(onlyNew)
    await onDone?.()
    if (res.recordsUpdated > 0) {
      toast.success(t('places.standardizeDone', { count: res.recordsUpdated }), { id })
    } else {
      toast.success(t('places.standardizeNone'), { id })
    }
  } catch {
    toast.error(t('places.standardizeFailed'), { id })
  } finally {
    unsub()
  }
}
