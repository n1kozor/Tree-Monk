import type { TFunction } from 'i18next'
import type { FamilySearchStatus } from '@shared/types'

/** Human-readable, translated description of a FamilySearch import status line. */
export function describe(t: TFunction, s: FamilySearchStatus): string {
  switch (s.phase) {
    case 'auth':
      return t('fs.statusAuth')
    case 'fetching_root':
      return t('fs.statusRoot')
    case 'processed':
      return t('fs.statusProcessed', { name: s.name, count: s.count })
    case 'limit':
      return t('fs.statusLimit', { individuals: s.individuals })
    case 'ancestors':
      return t('fs.statusAncestors', { generation: s.generation, count: s.count })
    case 'ancestors_done':
      return t('fs.statusAncestorsDone', { total: s.total })
    case 'side_branches':
      return t('fs.statusSideBranches', { processed: s.processed, total: s.total })
    case 'downloading_children':
      return t('fs.statusChildren', { count: s.count })
    case 'writing_gedcom':
      return t('fs.statusWriting', { individuals: s.individuals })
    case 'ingesting':
      return t('fs.statusIngesting')
    case 'done':
      return t('fs.statusDone')
    case 'error':
      return s.message ?? t('fs.error')
    default:
      return s.phase
  }
}

/** Maps the raw error from the importer to a friendly, translated message. */
export function mapError(t: TFunction, e: unknown): string {
  const msg = (e as Error).message
  if (msg === 'BROWSER_LOGIN') return t('fs.browserLogin')
  if (msg === 'TIMEOUT') return t('fs.timeout')
  if (msg === 'PYTHON_NOT_FOUND') return t('fs.noPython')
  return msg
}
