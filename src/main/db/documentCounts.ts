import { getDb } from './connection'

/** Document counts for every person, in one grouped query. */
export function documentCountsByPerson(): Map<string, number> {
  const rows = getDb()
    .prepare('SELECT person_id, COUNT(*) AS n FROM person_documents GROUP BY person_id')
    .all() as { person_id: string; n: number }[]
  const m = new Map<string, number>()
  for (const r of rows) m.set(r.person_id, r.n)
  return m
}
