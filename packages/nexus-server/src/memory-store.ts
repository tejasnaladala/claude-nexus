import type { MemoryEntry, MemoryScope, MemorySnapshot } from "@claude-nexus/core";
import Database from "better-sqlite3";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS memory (
    key TEXT NOT NULL,
    scope TEXT NOT NULL CHECK(scope IN ('shared', 'task', 'agent')),
    value TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    author_agent_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    ttl INTEGER,
    PRIMARY KEY (key, scope)
  );

  CREATE INDEX IF NOT EXISTS idx_memory_scope ON memory(scope);
  CREATE INDEX IF NOT EXISTS idx_memory_updated ON memory(updated_at);

  CREATE TABLE IF NOT EXISTS tasks (
    task_id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

  CREATE TABLE IF NOT EXISTS debates (
    debate_id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`;

export class MemoryStore {
  private db: Database.Database;
  private globalVersion = 0;

  constructor(dbPath: string = ":memory:") {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.exec(SCHEMA);
  }

  write(
    key: string,
    value: unknown,
    scope: MemoryScope,
    authorAgentId: string,
    ttl?: number,
  ): MemoryEntry {
    const now = Date.now();
    const serialized = JSON.stringify(value);

    const existing = this.db
      .prepare("SELECT version FROM memory WHERE key = ? AND scope = ?")
      .get(key, scope) as { version: number } | undefined;

    const version = existing ? existing.version + 1 : 1;

    this.db
      .prepare(
        `INSERT INTO memory (key, scope, value, version, author_agent_id, created_at, updated_at, ttl)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(key, scope) DO UPDATE SET
           value = excluded.value,
           version = excluded.version,
           author_agent_id = excluded.author_agent_id,
           updated_at = excluded.updated_at,
           ttl = excluded.ttl`,
      )
      .run(key, scope, serialized, version, authorAgentId, now, now, ttl ?? null);

    this.globalVersion++;

    return {
      key,
      value,
      scope,
      version,
      authorAgentId,
      createdAt: now,
      updatedAt: now,
      ttl,
    };
  }

  read(key: string, scope: MemoryScope): MemoryEntry | null {
    const row = this.db
      .prepare("SELECT * FROM memory WHERE key = ? AND scope = ?")
      .get(key, scope) as DbMemoryRow | undefined;

    if (!row) return null;

    if (row.ttl && Date.now() > row.created_at + row.ttl) {
      this.delete(key, scope);
      return null;
    }

    return rowToEntry(row);
  }

  delete(key: string, scope: MemoryScope): boolean {
    const result = this.db
      .prepare("DELETE FROM memory WHERE key = ? AND scope = ?")
      .run(key, scope);
    if (result.changes > 0) this.globalVersion++;
    return result.changes > 0;
  }

  list(scope: MemoryScope, prefix?: string): MemoryEntry[] {
    const now = Date.now();
    let rows: DbMemoryRow[];

    if (prefix) {
      rows = this.db
        .prepare(
          "SELECT * FROM memory WHERE scope = ? AND key LIKE ? ORDER BY updated_at DESC",
        )
        .all(scope, `${prefix}%`) as DbMemoryRow[];
    } else {
      rows = this.db
        .prepare(
          "SELECT * FROM memory WHERE scope = ? ORDER BY updated_at DESC",
        )
        .all(scope) as DbMemoryRow[];
    }

    return rows
      .filter((row) => !row.ttl || now <= row.created_at + row.ttl)
      .map(rowToEntry);
  }

  getSnapshot(since?: number): MemorySnapshot {
    const now = Date.now();
    let rows: DbMemoryRow[];

    if (since) {
      rows = this.db
        .prepare("SELECT * FROM memory WHERE updated_at > ? ORDER BY updated_at ASC")
        .all(since) as DbMemoryRow[];
    } else {
      rows = this.db
        .prepare("SELECT * FROM memory ORDER BY updated_at ASC")
        .all() as DbMemoryRow[];
    }

    return {
      entries: rows
        .filter((row) => !row.ttl || now <= row.created_at + row.ttl)
        .map(rowToEntry),
      timestamp: now,
      version: this.globalVersion,
    };
  }

  applySnapshot(snapshot: MemorySnapshot): void {
    const upsert = this.db.prepare(
      `INSERT INTO memory (key, scope, value, version, author_agent_id, created_at, updated_at, ttl)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(key, scope) DO UPDATE SET
         value = excluded.value,
         version = excluded.version,
         author_agent_id = excluded.author_agent_id,
         updated_at = excluded.updated_at,
         ttl = excluded.ttl
       WHERE excluded.version > memory.version`,
    );

    const applyAll = this.db.transaction(() => {
      for (const entry of snapshot.entries) {
        upsert.run(
          entry.key,
          entry.scope,
          JSON.stringify(entry.value),
          entry.version,
          entry.authorAgentId,
          entry.createdAt,
          entry.updatedAt,
          entry.ttl ?? null,
        );
      }
    });

    applyAll();
    this.globalVersion = Math.max(this.globalVersion, snapshot.version);
  }

  saveTask(taskId: string, data: Record<string, unknown>, status: string): void {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO tasks (task_id, data, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(task_id) DO UPDATE SET
           data = excluded.data,
           status = excluded.status,
           updated_at = excluded.updated_at`,
      )
      .run(taskId, JSON.stringify(data), status, now, now);
  }

  loadTask(taskId: string): Record<string, unknown> | null {
    const row = this.db
      .prepare("SELECT data FROM tasks WHERE task_id = ?")
      .get(taskId) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : null;
  }

  loadTasksByStatus(status: string): Array<Record<string, unknown>> {
    const rows = this.db
      .prepare("SELECT data FROM tasks WHERE status = ?")
      .all(status) as Array<{ data: string }>;
    return rows.map((r) => JSON.parse(r.data));
  }

  loadAllTasks(): Array<Record<string, unknown>> {
    const rows = this.db
      .prepare("SELECT data FROM tasks ORDER BY created_at ASC")
      .all() as Array<{ data: string }>;
    return rows.map((r) => JSON.parse(r.data));
  }

  saveDebate(debateId: string, data: Record<string, unknown>, status: string): void {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO debates (debate_id, data, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(debate_id) DO UPDATE SET
           data = excluded.data,
           status = excluded.status,
           updated_at = excluded.updated_at`,
      )
      .run(debateId, JSON.stringify(data), status, now, now);
  }

  loadDebate(debateId: string): Record<string, unknown> | null {
    const row = this.db
      .prepare("SELECT data FROM debates WHERE debate_id = ?")
      .get(debateId) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : null;
  }

  close(): void {
    this.db.close();
  }

  get version(): number {
    return this.globalVersion;
  }
}

interface DbMemoryRow {
  key: string;
  scope: MemoryScope;
  value: string;
  version: number;
  author_agent_id: string;
  created_at: number;
  updated_at: number;
  ttl: number | null;
}

function rowToEntry(row: DbMemoryRow): MemoryEntry {
  return {
    key: row.key,
    value: JSON.parse(row.value),
    scope: row.scope,
    version: row.version,
    authorAgentId: row.author_agent_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ttl: row.ttl ?? undefined,
  };
}
