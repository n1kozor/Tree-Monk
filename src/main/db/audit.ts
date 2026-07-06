import type Database from 'better-sqlite3'
import { getDb } from './connection'
import { undoMerge } from './duplicates'
import type { AuditEntry, AuditFilter, AuditImpact, AuditPage } from '@shared/types'

/**
 * Change history ("audit log") for every user edit, captured by SQLite triggers
 * so NO write path can bypass it. A single `audit_state.enabled` flag lets bulk
 * operations (imports, restore, migrations, the revert itself) suppress logging
 * so they don't flood the history. Each entry stores the full BEFORE/AFTER row as
 * JSON, which makes a generic, table-agnostic "undo" possible.
 */

interface AuditTable {
  table: string
  /** Friendly category used for grouping/labels in the UI. */
  entity: string
  /** All columns, in a stable order (used for re-insert on undo of a delete). */
  cols: string[]
  /** Primary-key columns (single, or composite for join tables). */
  pk: string[]
}

/** Every user-editable table whose changes are worth tracking + undoing. */
const TABLES: AuditTable[] = [
  {
    table: 'people',
    entity: 'person',
    pk: ['id'],
    cols: [
      'id', 'gedcom_id', 'fs_id', 'given_name', 'surname', 'sex', 'birth_date', 'birth_place',
      'death_date', 'death_place', 'deceased', 'illegitimate', 'burial_date', 'burial_place', 'christening_date',
      'christening_place', 'religion', 'occupation', 'notes', 'profile_photo_id', 'created_at', 'updated_at'
    ]
  },
  { table: 'families', entity: 'family', pk: ['id'], cols: ['id', 'gedcom_id', 'husband_id', 'wife_id', 'marriage_date', 'marriage_place', 'marriage_order', 'notes'] },
  { table: 'family_children', entity: 'family_child', pk: ['family_id', 'child_id'], cols: ['family_id', 'child_id', 'ordinal'] },
  { table: 'events', entity: 'event', pk: ['id'], cols: ['id', 'owner_type', 'owner_id', 'type', 'date', 'place', 'value', 'note', 'fs_key', 'ordinal'] },
  { table: 'occupations', entity: 'occupation', pk: ['id'], cols: ['id', 'person_id', 'title', 'start_date', 'end_date', 'note'] },
  { table: 'aliases', entity: 'alias', pk: ['id'], cols: ['id', 'person_id', 'given_name', 'surname', 'kind', 'note'] },
  { table: 'sources', entity: 'source', pk: ['id'], cols: ['id', 'gedcom_id', 'title', 'author', 'publication', 'repository_id', 'text', 'record_date'] },
  { table: 'citations', entity: 'citation', pk: ['id'], cols: ['id', 'source_id', 'owner_type', 'owner_id', 'event_tag', 'page', 'quality', 'note'] },
  { table: 'notes', entity: 'note', pk: ['id'], cols: ['id', 'gedcom_id', 'text'] },
  { table: 'documents', entity: 'document', pk: ['id'], cols: ['id', 'title', 'kind', 'file_path', 'mime_type', 'date', 'description', 'created_at'] },
  { table: 'person_documents', entity: 'person_document', pk: ['person_id', 'document_id'], cols: ['person_id', 'document_id'] }
]

const BY_TABLE = new Map(TABLES.map((t) => [t.table, t]))

/** Text columns folded into the denormalized `label` column so search at scale
 *  is a single indexed-then-LIKE scan, never a JSON walk over millions of rows. */
const LABEL_COLS: Record<string, string[]> = {
  people: ['given_name', 'surname', 'birth_place', 'death_place'],
  families: ['marriage_place'],
  events: ['type', 'value', 'place'],
  occupations: ['title', 'note'],
  aliases: ['given_name', 'surname'],
  sources: ['title', 'author', 'publication'],
  citations: ['page', 'note'],
  notes: ['text'],
  documents: ['title', 'description']
}

const jsonObj = (ref: 'NEW' | 'OLD', cols: string[]): string =>
  `json_object(${cols.map((c) => `'${c}', ${ref}.${c}`).join(', ')})`
const idExpr = (ref: 'NEW' | 'OLD', pk: string[]): string =>
  pk.length === 1 ? `${ref}.${pk[0]}` : pk.map((c) => `${ref}.${c}`).join(" || ':' || ")
const labelExpr = (ref: 'NEW' | 'OLD', table: string): string => {
  const cols = LABEL_COLS[table]
  if (!cols?.length) return "''"
  return cols.map((c) => `COALESCE(${ref}.${c}, '')`).join(" || ' ' || ")
}

/** The full audit DDL: state flag, log table, and per-table triggers. */
function auditSql(): string {
  const guard = 'WHEN (SELECT enabled FROM audit_state WHERE id = 1) = 1'
  let sql = `
CREATE TABLE IF NOT EXISTS audit_state (
  id      INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO audit_state (id, enabled) VALUES (1, 0);

CREATE TABLE IF NOT EXISTS audit_log (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         TEXT NOT NULL DEFAULT (datetime('now')),
  entity     TEXT NOT NULL,
  table_name TEXT NOT NULL,
  entity_id  TEXT NOT NULL,
  action     TEXT NOT NULL,
  label      TEXT,
  before     TEXT,
  after      TEXT,
  undone     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(table_name, entity_id);
-- Compound (filter, seq) indexes so a filtered + keyset-paged scan stays O(log n)
-- even at millions of rows (ORDER BY seq DESC walks the index backwards).
CREATE INDEX IF NOT EXISTS idx_audit_entity_seq ON audit_log(entity, seq);
CREATE INDEX IF NOT EXISTS idx_audit_action_seq ON audit_log(action, seq);
`
  for (const t of TABLES) {
    // DROP+CREATE (not IF NOT EXISTS) so a column-set change refreshes the triggers.
    sql += `
DROP TRIGGER IF EXISTS audit_${t.table}_ins;
CREATE TRIGGER audit_${t.table}_ins AFTER INSERT ON ${t.table} ${guard}
BEGIN
  INSERT INTO audit_log (entity, table_name, entity_id, action, label, after)
  VALUES ('${t.entity}', '${t.table}', ${idExpr('NEW', t.pk)}, 'create', ${labelExpr('NEW', t.table)}, ${jsonObj('NEW', t.cols)});
END;
DROP TRIGGER IF EXISTS audit_${t.table}_upd;
CREATE TRIGGER audit_${t.table}_upd AFTER UPDATE ON ${t.table} ${guard}
BEGIN
  INSERT INTO audit_log (entity, table_name, entity_id, action, label, before, after)
  VALUES ('${t.entity}', '${t.table}', ${idExpr('NEW', t.pk)}, 'update', ${labelExpr('NEW', t.table)}, ${jsonObj('OLD', t.cols)}, ${jsonObj('NEW', t.cols)});
END;
DROP TRIGGER IF EXISTS audit_${t.table}_del;
CREATE TRIGGER audit_${t.table}_del AFTER DELETE ON ${t.table} ${guard}
BEGIN
  INSERT INTO audit_log (entity, table_name, entity_id, action, label, before)
  VALUES ('${t.entity}', '${t.table}', ${idExpr('OLD', t.pk)}, 'delete', ${labelExpr('OLD', t.table)}, ${jsonObj('OLD', t.cols)});
END;
`
  }
  return sql
}

/** Installs the audit schema/triggers. Called once per DB open, after migrate(). */
export function applyAuditSchema(db: Database.Database): void {
  // Add `label` to a pre-existing audit_log from before this column existed.
  try {
    db.exec('ALTER TABLE audit_log ADD COLUMN label TEXT')
  } catch {
    /* column already exists */
  }
  db.exec(auditSql())
}

interface AuditRow {
  seq: number
  ts: string
  entity: string
  table_name: string
  entity_id: string
  action: 'create' | 'update' | 'delete'
  label: string | null
  before: string | null
  after: string | null
  undone: number
}

/** Escapes LIKE wildcards so a search for "50%" matches the literal text. */
const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (m) => '\\' + m)

type Json = Record<string, unknown>
const parse = (s: string | null): Json | null => {
  if (!s) return null
  try {
    return JSON.parse(s) as Json
  } catch {
    return null
  }
}
const str = (v: unknown): string | null => (v == null ? null : String(v))

/** Best-effort human label + the related person id (for click-through). */
function describe(row: AuditRow): { label: string; personId: string | null } {
  const data = parse(row.after) ?? parse(row.before) ?? {}
  const name = `${str(data.given_name) ?? ''} ${str(data.surname) ?? ''}`.trim()
  switch (row.entity) {
    case 'person':
      return { label: name, personId: str(data.id) }
    case 'alias':
      return { label: name, personId: str(data.person_id) }
    case 'occupation':
      return { label: str(data.title) ?? '', personId: str(data.person_id) }
    case 'event':
      return { label: str(data.value) || str(data.type) || '', personId: data.owner_type === 'person' ? str(data.owner_id) : null }
    case 'citation':
      return { label: str(data.page) ?? '', personId: data.owner_type === 'person' ? str(data.owner_id) : null }
    case 'document':
    case 'source':
      return { label: str(data.title) ?? '', personId: null }
    case 'note':
      return { label: (str(data.text) ?? '').slice(0, 60), personId: null }
    case 'person_document':
      return { label: '', personId: str(data.person_id) }
    default:
      return { label: '', personId: null }
  }
}

/** For an update, the columns whose value actually changed (timestamps hidden). */
function changedFields(row: AuditRow): AuditEntry['fields'] {
  if (row.action !== 'update' || row.entity === 'merge') return []
  const before = parse(row.before) ?? {}
  const after = parse(row.after) ?? {}
  const out: AuditEntry['fields'] = []
  for (const c of Object.keys(after)) {
    if (c === 'updated_at') continue
    const a = str(before[c])
    const b = str(after[c])
    if (a !== b) out.push({ field: c, from: a, to: b })
  }
  return out
}

function toEntry(row: AuditRow): AuditEntry {
  const isMerge = row.entity === 'merge'
  const { label, personId } = describe(row)
  return {
    seq: row.seq,
    ts: row.ts,
    entity: row.entity,
    table: row.table_name,
    entityId: row.entity_id,
    action: row.action,
    // A merge entry carries its label in the column and points at the survivor.
    label: isMerge ? row.label ?? '' : label,
    personId: isMerge ? row.entity_id : personId,
    fields: changedFields(row),
    undone: !!row.undone
  }
}

const enabledNow = (db: Database.Database): boolean =>
  (db.prepare('SELECT enabled FROM audit_state WHERE id = 1').get() as { enabled: number } | undefined)?.enabled === 1

export const Audit = {
  /** Turns change-logging on (steady state) — called once after DB init. */
  enable(): void {
    getDb().prepare('UPDATE audit_state SET enabled = 1 WHERE id = 1').run()
  },
  setEnabled(on: boolean): void {
    getDb().prepare('UPDATE audit_state SET enabled = ? WHERE id = 1').run(on ? 1 : 0)
  },
  /** Runs `fn` with logging suppressed, then restores the prior state. */
  pause<T>(fn: () => T): T {
    const db = getDb()
    const prev = enabledNow(db)
    this.setEnabled(false)
    try {
      return fn()
    } finally {
      this.setEnabled(prev)
    }
  },
  /** Async variant of pause() for bulk operations (imports, restore, downloads). */
  async pauseAsync<T>(fn: () => Promise<T>): Promise<T> {
    const prev = enabledNow(getDb())
    this.setEnabled(false)
    try {
      return await fn()
    } finally {
      this.setEnabled(prev)
    }
  },

  /**
   * A filtered, keyset-paged slice of the history. Designed for millions of rows:
   * filters hit compound indexes, paging uses `seq < cursor` (NOT OFFSET, which
   * degrades linearly), and search is a single LIKE on the lean `label` column.
   */
  query(filter: AuditFilter = {}): AuditPage {
    const db = getDb()
    const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500)

    const where: string[] = []
    const args: unknown[] = []
    if (filter.entity) {
      where.push('entity = ?')
      args.push(filter.entity)
    }
    if (filter.action) {
      where.push('action = ?')
      args.push(filter.action)
    }
    if (filter.search && filter.search.trim()) {
      where.push("label LIKE ? ESCAPE '\\'")
      args.push('%' + escapeLike(filter.search.trim()) + '%')
    }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : ''

    const total = (db.prepare(`SELECT COUNT(*) AS n FROM audit_log ${whereSql}`).get(...args) as { n: number }).n

    const pageWhere = [...where]
    const pageArgs = [...args]
    if (filter.beforeSeq != null) {
      pageWhere.push('seq < ?')
      pageArgs.push(filter.beforeSeq)
    }
    const pageWhereSql = pageWhere.length ? 'WHERE ' + pageWhere.join(' AND ') : ''
    // Fetch one extra row to know whether another page exists.
    const rows = db
      .prepare(`SELECT * FROM audit_log ${pageWhereSql} ORDER BY seq DESC LIMIT ?`)
      .all(...pageArgs, limit + 1) as AuditRow[]
    const hasMore = rows.length > limit
    return { entries: rows.slice(0, limit).map(toEntry), total, hasMore }
  },

  /** What reverting this entry would touch — drives the warning shown to the user. */
  impact(seq: number): AuditImpact {
    const db = getDb()
    const row = db.prepare('SELECT * FROM audit_log WHERE seq = ?').get(seq) as AuditRow | undefined
    if (!row) return { laterEdits: 0, cascadeCount: 0, missingRefs: [] }

    // The change the user explicitly worries about: later edits to the SAME row
    // that an undo would silently overwrite.
    const laterEdits = (
      db.prepare('SELECT COUNT(*) AS n FROM audit_log WHERE table_name = ? AND entity_id = ? AND seq > ? AND undone = 0')
        .get(row.table_name, row.entity_id, seq) as { n: number }
    ).n

    let cascadeCount = 0
    const missingRefs: string[] = []
    const data = parse(row.after) ?? parse(row.before) ?? {}

    // Undoing a CREATE means deleting the row → count rows that would cascade away.
    if (row.action === 'create') {
      if (row.table_name === 'people') {
        const id = str(data.id)!
        cascadeCount = countPersonDependents(db, id)
      } else if (row.table_name === 'families') {
        const id = str(data.id)!
        cascadeCount =
          num(db, 'SELECT COUNT(*) AS n FROM family_children WHERE family_id = ?', id) +
          num(db, "SELECT COUNT(*) AS n FROM citations WHERE owner_type = 'family' AND owner_id = ?", id)
      }
    }

    // Undoing a DELETE means re-inserting → a referenced parent may be gone now,
    // which would make the row dangle (or the insert fail on a foreign key).
    if (row.action === 'delete') {
      const exists = (table: string, id: string | null): boolean =>
        !!id && !!db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id)
      if (row.table_name === 'families') {
        if (str(data.husband_id) && !exists('people', str(data.husband_id))) missingRefs.push('husband')
        if (str(data.wife_id) && !exists('people', str(data.wife_id))) missingRefs.push('wife')
      } else if (row.table_name === 'family_children') {
        if (!exists('families', str(data.family_id))) missingRefs.push('family')
        if (!exists('people', str(data.child_id))) missingRefs.push('child')
      } else if (['occupations', 'aliases'].includes(row.table_name)) {
        if (!exists('people', str(data.person_id))) missingRefs.push('person')
      } else if (row.table_name === 'events' && data.owner_type === 'person') {
        if (!exists('people', str(data.owner_id))) missingRefs.push('person')
      } else if (row.table_name === 'person_documents') {
        if (!exists('people', str(data.person_id))) missingRefs.push('person')
        if (!exists('documents', str(data.document_id))) missingRefs.push('document')
      }
    }

    return { laterEdits, cascadeCount, missingRefs }
  },

  /** Applies the inverse of an audit entry (paused, so it isn't logged again). */
  revert(seq: number): { ok: boolean; error?: string } {
    const db = getDb()
    const row = db.prepare('SELECT * FROM audit_log WHERE seq = ?').get(seq) as AuditRow | undefined
    if (!row) return { ok: false, error: 'not-found' }
    if (row.undone) return { ok: false, error: 'already-undone' }
    // A merge is reversed from the whole snapshot stored in `before`.
    if (row.table_name === '__merge__') {
      try {
        undoMerge((parse(row.before) ?? {}) as Record<string, unknown>)
        db.prepare('UPDATE audit_log SET undone = 1 WHERE seq = ?').run(seq)
        return { ok: true }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    }
    const t = BY_TABLE.get(row.table_name)
    if (!t) return { ok: false, error: 'unknown-table' }

    try {
      this.pause(() => {
        const tx = db.transaction(() => {
          if (row.action === 'create') {
            const after = parse(row.after) ?? {}
            db.prepare(`DELETE FROM ${t.table} WHERE ${t.pk.map((c) => `${c} = ?`).join(' AND ')}`).run(
              t.pk.map((c) => after[c] ?? null)
            )
          } else if (row.action === 'delete') {
            const before = parse(row.before) ?? {}
            db.prepare(
              `INSERT OR REPLACE INTO ${t.table} (${t.cols.join(', ')}) VALUES (${t.cols.map(() => '?').join(', ')})`
            ).run(t.cols.map((c) => before[c] ?? null))
          } else {
            const before = parse(row.before) ?? {}
            const setCols = t.cols.filter((c) => !t.pk.includes(c))
            db.prepare(
              `UPDATE ${t.table} SET ${setCols.map((c) => `${c} = ?`).join(', ')} WHERE ${t.pk.map((c) => `${c} = ?`).join(' AND ')}`
            ).run([...setCols.map((c) => before[c] ?? null), ...t.pk.map((c) => before[c] ?? null)])
          }
          db.prepare('UPDATE audit_log SET undone = 1 WHERE seq = ?').run(seq)
        })
        tx()
      })
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }
}

function num(db: Database.Database, sql: string, ...args: unknown[]): number {
  return (db.prepare(sql).get(...args) as { n: number }).n
}

/** Rows that an `ON DELETE` would remove/null when a person is deleted. */
function countPersonDependents(db: Database.Database, id: string): number {
  return (
    num(db, 'SELECT COUNT(*) AS n FROM families WHERE husband_id = ? OR wife_id = ?', id, id) +
    num(db, 'SELECT COUNT(*) AS n FROM family_children WHERE child_id = ?', id) +
    num(db, "SELECT COUNT(*) AS n FROM events WHERE owner_type = 'person' AND owner_id = ?", id) +
    num(db, 'SELECT COUNT(*) AS n FROM occupations WHERE person_id = ?', id) +
    num(db, 'SELECT COUNT(*) AS n FROM aliases WHERE person_id = ?', id) +
    num(db, "SELECT COUNT(*) AS n FROM citations WHERE owner_type = 'person' AND owner_id = ?", id) +
    num(db, 'SELECT COUNT(*) AS n FROM person_documents WHERE person_id = ?', id)
  )
}
