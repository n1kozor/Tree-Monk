// Headless smoke test: boots Electron's node, opens better-sqlite3,
// applies the real schema, and runs a CRUD + tree round-trip. No window.
import { app } from 'electron'
import Database from 'better-sqlite3'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'

const SCHEMA = readFileSync(
  new URL('../src/main/db/schema.ts', import.meta.url),
  'utf-8'
).replace(/^[\s\S]*?`/, '').replace(/`\s*$/, '')

app.disableHardwareAcceleration()

app.whenReady().then(() => {
  const file = join(tmpdir(), `treemonk-smoke-${randomUUID()}.db`)
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)

  const now = new Date().toISOString()
  const p1 = randomUUID()
  const p2 = randomUUID()
  const ins = db.prepare(
    `INSERT INTO people (id, given_name, surname, sex, birth_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  ins.run(p1, 'Anna', 'Kovács', 'F', '1901', now, now)
  ins.run(p2, 'Béla', 'Kovács', 'M', '1925', now, now)

  const fam = randomUUID()
  db.prepare(
    `INSERT INTO families (id, wife_id, marriage_date) VALUES (?, ?, ?)`
  ).run(fam, p1, '1923')
  db.prepare(
    `INSERT INTO family_children (family_id, child_id, ordinal) VALUES (?, ?, 0)`
  ).run(fam, p2)

  const people = db.prepare('SELECT * FROM people ORDER BY birth_date').all()
  const kids = db
    .prepare('SELECT child_id FROM family_children WHERE family_id = ?')
    .all(fam)

  const board = randomUUID()
  db.prepare(
    `INSERT INTO board_nodes (id, board_id, kind, ref_id, pos_x, pos_y, data)
     VALUES (?, 'main', 'person', ?, 100, 200, '{}')`
  ).run(board, p1)
  const nodes = db.prepare('SELECT * FROM board_nodes').all()

  const ok =
    people.length === 2 &&
    people[0].given_name === 'Anna' &&
    kids.length === 1 &&
    kids[0].child_id === p2 &&
    nodes.length === 1 &&
    nodes[0].pos_x === 100

  db.close()
  console.log(JSON.stringify({ ok, people: people.length, kids: kids.length, nodes: nodes.length }))
  app.exit(ok ? 0 : 1)
})
