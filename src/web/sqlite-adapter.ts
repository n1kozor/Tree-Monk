import type { Database as SqlJsDatabase, BindParams, SqlValue } from 'sql.js'

/** better-sqlite3's `.run()` return shape (only `changes` is used by the app). */
export interface RunResult {
  changes: number
  lastInsertRowid: number
}

type Row = Record<string, SqlValue>

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Uint8Array)
}

/**
 * Maps better-sqlite3-style call arguments to sql.js bind params.
 *  - a single plain object  → named binding (the app writes `@name` in SQL)
 *  - anything else          → positional `?` binding
 */
function toBind(args: unknown[]): BindParams | undefined {
  if (args.length === 0) return undefined
  if (args.length === 1 && isPlainObject(args[0])) {
    const out: Record<string, SqlValue> = {}
    for (const [k, v] of Object.entries(args[0])) out['@' + k] = v as SqlValue
    return out
  }
  return args as SqlValue[]
}

/** A prepared statement exposing the subset of better-sqlite3 the app uses. */
class WasmStatement {
  constructor(
    private readonly db: SqlJsDatabase,
    private readonly sql: string
  ) {}

  all(...args: unknown[]): Row[] {
    const s = this.db.prepare(this.sql)
    try {
      const bind = toBind(args)
      if (bind) s.bind(bind)
      const rows: Row[] = []
      while (s.step()) rows.push(s.getAsObject())
      return rows
    } finally {
      s.free()
    }
  }

  get(...args: unknown[]): Row | undefined {
    const s = this.db.prepare(this.sql)
    try {
      const bind = toBind(args)
      if (bind) s.bind(bind)
      return s.step() ? s.getAsObject() : undefined
    } finally {
      s.free()
    }
  }

  run(...args: unknown[]): RunResult {
    const s = this.db.prepare(this.sql)
    try {
      const bind = toBind(args)
      if (bind) s.bind(bind)
      s.step()
      return { changes: this.db.getRowsModified(), lastInsertRowid: 0 }
    } finally {
      s.free()
    }
  }
}

/**
 * Wraps a sql.js (WASM SQLite) database so the app's repository layer — written
 * against better-sqlite3's synchronous API — runs unchanged in the browser. Used
 * by the read-only web demo; the underlying database is an in-memory copy of a
 * bundled sample, so nothing is persisted.
 */
export class WasmDatabase {
  constructor(private readonly db: SqlJsDatabase) {}

  prepare(sql: string): WasmStatement {
    return new WasmStatement(this.db, sql)
  }

  /** Run one or more statements, ignoring any rows (schema / pragmas). */
  exec(sql: string): this {
    this.db.run(sql)
    return this
  }

  /** No-op: WAL / foreign-key pragmas are irrelevant for an in-memory copy. */
  pragma(): unknown[] {
    return []
  }

  transaction<T extends (...a: never[]) => unknown>(fn: T): T {
    const wrapped = (...args: Parameters<T>): ReturnType<T> => {
      this.db.run('BEGIN')
      try {
        const r = fn(...args) as ReturnType<T>
        this.db.run('COMMIT')
        return r
      } catch (e) {
        this.db.run('ROLLBACK')
        throw e
      }
    }
    return wrapped as unknown as T
  }

  close(): void {
    this.db.close()
  }
}
