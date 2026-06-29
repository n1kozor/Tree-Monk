import type Database from 'better-sqlite3'
import initSqlJs from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { WasmDatabase } from './sqlite-adapter'

// Browser replacement for src/main/db/connection.ts. In the web-demo build this
// module is aliased over the Node one, so the whole repository/domain layer runs
// unchanged on an in-memory WASM SQLite copy of the bundled sample database.

let db: WasmDatabase | null = null

/**
 * Loads the sample database (raw SQLite bytes) into an in-memory WASM SQLite and
 * makes it the active DB. Call once, before the React app renders.
 */
export async function initDemoDb(bytes: Uint8Array): Promise<void> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl })
  db = new WasmDatabase(new SQL.Database(bytes))
}

/**
 * Drop-in for the Electron main process's getDb(). Typed as better-sqlite3's
 * Database so the repository layer (written against it) type-checks unchanged;
 * the WASM adapter implements the synchronous subset the app actually calls.
 */
export function getDb(): Database.Database {
  if (!db) throw new Error('Demo database not initialised — call initDemoDb() first')
  return db as unknown as Database.Database
}

// Filesystem helpers the Node connection exposes. Never used by the read-only
// demo, but present so the module shape matches what callers may import.
export function dataDir(): string {
  return '/demo'
}
export function mediaDir(): string {
  return '/demo/media'
}
export function closeDb(): void {
  db?.close()
  db = null
}
