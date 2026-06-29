import { create } from 'zustand'

/**
 * Opens the FamilySearch import dialog PRE-SEEDED with one person as the starting
 * point — a "deep import from this person" (only that branch, merged into the
 * existing tree). Triggered from a person's profile when they have an fsId.
 */
interface FsDeepImportState {
  /** FamilySearch id of the person to start from (null = dialog closed). */
  fid: string | null
  /** Display name shown locked in the dialog. */
  name: string
  open: (fid: string, name: string) => void
  close: () => void
}

export const useFsDeepImport = create<FsDeepImportState>((set) => ({
  fid: null,
  name: '',
  open: (fid, name) => set({ fid, name }),
  close: () => set({ fid: null, name: '' })
}))
