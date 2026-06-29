import { createContext, useContext } from 'react'

/** person id → a localized tooltip describing their unusual marriage(s). Shared
 *  by both the landscape pedigree and the standing portrait chart so the badge
 *  logic lives in one place. */
export const KinshipContext = createContext<Map<string, string> | null>(null)

export function useKinshipNote(id?: string | null): string | undefined {
  const m = useContext(KinshipContext)
  return id ? m?.get(id) : undefined
}
