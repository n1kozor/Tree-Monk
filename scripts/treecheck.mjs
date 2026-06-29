// Validates buildTree() logic against the REAL imported database.
import { app } from 'electron'
import Database from 'better-sqlite3'
import { join } from 'path'
import { existsSync, statSync } from 'fs'
import { homedir } from 'os'

app.disableHardwareAcceleration()

app.whenReady().then(() => {
  // The dev app runs under app-name "Electron"; the packaged one under "treemonk".
  // Pick whichever DB exists and is largest (= has the imported data).
  const candidates = [
    join(homedir(), '.config', 'Electron', 'data', 'treemonk.db'),
    join(homedir(), '.config', 'treemonk', 'data', 'treemonk.db'),
    join(app.getPath('userData'), 'data', 'treemonk.db')
  ].filter(existsSync)
  const dbPath = candidates.sort((a, b) => statSync(b).size - statSync(a).size)[0]
  const db = new Database(dbPath, { readonly: true, fileMustExist: true })

  const people = db.prepare('SELECT * FROM people').all()
  const families = db.prepare('SELECT * FROM families').all()
  const fc = db.prepare('SELECT * FROM family_children').all()

  const byId = new Map(people.map((p) => [p.id, p]))
  const childFamilyOf = new Map()
  const childIds = new Set()
  const parentIds = new Set()
  const childrenByFam = new Map()
  for (const r of fc) {
    if (!childrenByFam.has(r.family_id)) childrenByFam.set(r.family_id, [])
    childrenByFam.get(r.family_id).push(r.child_id)
  }
  for (const f of families) {
    for (const pid of [f.husband_id, f.wife_id]) if (pid) parentIds.add(pid)
    for (const c of childrenByFam.get(f.id) ?? []) {
      childIds.add(c)
      if (!childFamilyOf.has(c)) childFamilyOf.set(c, f)
    }
  }

  const parentsOf = (id) => {
    const f = childFamilyOf.get(id)
    return f ? [f.husband_id, f.wife_id].filter(Boolean) : []
  }
  const countAnc = (id) => {
    const seen = new Set()
    const st = [id]
    while (st.length) {
      const x = st.pop()
      if (seen.has(x)) continue
      seen.add(x)
      parentsOf(x).forEach((p) => st.push(p))
    }
    return seen.size
  }

  let candidates = people.filter((p) => childIds.has(p.id) && !parentIds.has(p.id))
  if (!candidates.length) candidates = people.filter((p) => childIds.has(p.id))
  const proband = candidates
    .map((p) => ({ p, score: countAnc(p.id) }))
    .sort((a, b) => b.score - a.score)[0]?.p

  const name = (p) => `${p.given_name} ${p.surname}`.trim()
  const depth = (id, d = 0) => {
    const ps = parentsOf(id)
    if (!ps.length) return d
    return Math.max(...ps.map((p) => depth(p, d + 1)))
  }

  const rootParents = proband ? parentsOf(proband.id).map((id) => name(byId.get(id))) : []

  console.log(
    JSON.stringify(
      {
        people: people.length,
        families: families.length,
        links: fc.length,
        proband: proband ? name(proband) : null,
        probandParents: rootParents,
        ancestorsReachable: proband ? countAnc(proband.id) : 0,
        maxDepth: proband ? depth(proband.id) : 0,
        bothSides: rootParents.length === 2
      },
      null,
      2
    )
  )
  db.close()
  app.exit(0)
})
