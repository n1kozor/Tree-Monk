import { describe, it, expect } from 'vitest'
import initSqlJs from 'sql.js'
import { WasmDatabase } from './sqlite-adapter'
import { SCHEMA_SQL } from '../main/db/schema'

/**
 * De-risking spike for the browser demo: prove that the real TreeMonk schema and
 * the exact better-sqlite3 call styles the repository layer uses (named `@param`
 * writes, positional `?` reads, `.all()` ordering) all run on WASM SQLite.
 */
describe('WasmDatabase adapter (sql.js)', () => {
  it('runs the real schema and every param style the repo uses', async () => {
    const SQL = await initSqlJs()
    const db = new WasmDatabase(new SQL.Database())

    // 1) The real production schema must apply cleanly.
    db.exec(SCHEMA_SQL)

    // 2) Named-param insert — exactly how repo.ts writes (`@name`).
    const ins = db.prepare(
      `INSERT INTO people (id, given_name, surname, sex, birth_date, created_at, updated_at)
       VALUES (@id, @given, @surname, @sex, @birth, @ts, @ts)`
    )
    ins.run({ id: 'p1', given: 'Anna', surname: 'Kovács', sex: 'F', birth: '1901', ts: '2020-01-01' })
    ins.run({ id: 'p2', given: 'Béla', surname: 'Almási', sex: 'M', birth: '1899', ts: '2020-01-01' })

    // 3) `.all()` with ORDER BY — exactly People.list().
    const rows = db.prepare('SELECT * FROM people ORDER BY surname, given_name').all()
    expect(rows.map((r) => r.id)).toEqual(['p2', 'p1']) // Almási < Kovács
    expect(rows[0].given_name).toBe('Béla')

    // 4) Positional `.get(?)` — exactly People.get(id).
    const one = db.prepare('SELECT given_name, sex FROM people WHERE id = ?').get('p1')
    expect(one?.given_name).toBe('Anna')
    expect(one?.sex).toBe('F')

    // 5) A miss returns undefined (repo relies on this).
    expect(db.prepare('SELECT * FROM people WHERE id = ?').get('nope')).toBeUndefined()

    // 6) A JOIN across two real tables (relationships are the heart of the app).
    db.prepare(
      `INSERT INTO families (id, husband_id, wife_id, marriage_date)
       VALUES (@id, @h, @w, @m)`
    ).run({ id: 'f1', h: 'p2', w: 'p1', m: '1925' })
    const couple = db
      .prepare(
        `SELECT h.given_name AS husband, w.given_name AS wife
         FROM families f
         JOIN people h ON h.id = f.husband_id
         JOIN people w ON w.id = f.wife_id
         WHERE f.id = ?`
      )
      .get('f1')
    expect(couple).toEqual({ husband: 'Béla', wife: 'Anna' })

    db.close()
  })
})
