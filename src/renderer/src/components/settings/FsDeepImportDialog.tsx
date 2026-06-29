import { FamilySearchImport } from './FamilySearchImport'
import { useFsDeepImport } from '@/store/useFsDeepImport'

/**
 * Global mount of the FamilySearch import dialog, pre-seeded with one person as
 * the starting point (the "deep import from this person" flow). Opened from a
 * person's profile via `useFsDeepImport`.
 */
export function FsDeepImportDialog(): JSX.Element {
  const fid = useFsDeepImport((s) => s.fid)
  const name = useFsDeepImport((s) => s.name)
  const close = useFsDeepImport((s) => s.close)
  return (
    <FamilySearchImport
      open={!!fid}
      onOpenChange={(v) => {
        if (!v) close()
      }}
      presetRoot={fid ?? undefined}
      presetName={name}
    />
  )
}
