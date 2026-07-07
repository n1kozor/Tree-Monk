import { getDb } from './connection'

/** Source counts for every person — attached documents PLUS source citations
 *  (the tree/pedigree tag shows how much evidence a person carries, so both
 *  belong in the number). Two grouped queries, merged. */
export function documentCountsByPerson(): Map<string, number> {
  const db = getDb()
  const m = new Map<string, number>()
  const docs = db
    .prepare('SELECT person_id, COUNT(*) AS n FROM person_documents GROUP BY person_id')
    .all() as { person_id: string; n: number }[]
  for (const r of docs) m.set(r.person_id, r.n)
  const cites = db
    .prepare("SELECT owner_id, COUNT(*) AS n FROM citations WHERE owner_type = 'person' GROUP BY owner_id")
    .all() as { owner_id: string; n: number }[]
  for (const r of cites) m.set(r.owner_id, (m.get(r.owner_id) ?? 0) + r.n)
  return m
}
