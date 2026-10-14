/**
 * Offline sync layer using IndexedDB.
 *
 * Every record is saved locally first, then synced to the server in the background.
 * Records carry a client-generated UUID as their `id` — the server treats a repeated
 * `id` as already saved (idempotent).
 *
 * Status per record: 'pending' | 'synced' | 'failed'
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export type SyncStatus = 'pending' | 'synced' | 'failed';

export interface QueuedRecord {
  id: string;           // client-generated UUID
  table: string;        // target table name
  data: Record<string, unknown>;
  status: SyncStatus;
  created_at: string;   // ISO timestamp
  synced_at: string | null;
  error: string | null;
  retry_count: number;
}

interface FnvDB extends DBSchema {
  sync_queue: {
    key: string;
    value: QueuedRecord;
    indexes: {
      'by-status': SyncStatus;
      'by-table': string;
    };
  };
}

const DB_NAME = 'fnv_daily_ops';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<FnvDB>> | null = null;

function getDB(): Promise<IDBPDatabase<FnvDB>> {
  if (!dbPromise) {
    dbPromise = openDB<FnvDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore('sync_queue', { keyPath: 'id' });
        store.createIndex('by-status', 'status');
        store.createIndex('by-table', 'table');
      },
    });
  }
  return dbPromise;
}

/** Generate a UUID for a new record */
export function newId(): string {
  return crypto.randomUUID();
}

/** Get the device ID (stable per browser) */
export function getDeviceId(): string {
  const key = 'fnv_device_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

/** Save a record to IndexedDB and attempt to sync */
export async function enqueue(table: string, data: Record<string, unknown>): Promise<QueuedRecord> {
  const db = await getDB();
  const record: QueuedRecord = {
    id: (data.id as string) || newId(),
    table,
    data: { ...data, id: data.id || newId() },
    status: 'pending',
    created_at: new Date().toISOString(),
    synced_at: null,
    error: null,
    retry_count: 0,
  };
  // Ensure the record data has the same id
  record.data.id = record.id;
  await db.put('sync_queue', record);
  // Attempt immediate sync in background
  syncOne(record.id).catch(() => { /* will retry later */ });
  return record;
}

/** Get all records with a given status */
export async function getByStatus(status: SyncStatus): Promise<QueuedRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex('sync_queue', 'by-status', status);
}

/** Get all records for a table */
export async function getByTable(table: string): Promise<QueuedRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex('sync_queue', 'by-table', table);
}

/** Get a single record by id */
export async function getRecord(id: string): Promise<QueuedRecord | undefined> {
  const db = await getDB();
  return db.get('sync_queue', id);
}

/** Attempt to sync one record to the server */
async function syncOne(id: string): Promise<void> {
  const db = await getDB();
  const record = await db.get('sync_queue', id);
  if (!record || record.status === 'synced') return;

  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: record.table, data: record.data }),
    });

    if (res.ok) {
      record.status = 'synced';
      record.synced_at = new Date().toISOString();
      record.error = null;
    } else if (res.status === 409) {
      // Already exists (idempotent) — treat as synced
      record.status = 'synced';
      record.synced_at = new Date().toISOString();
      record.error = null;
    } else {
      const body = await res.text();
      record.status = 'failed';
      record.error = `${res.status}: ${body}`;
      record.retry_count += 1;
    }
  } catch (err) {
    record.status = 'failed';
    record.error = err instanceof Error ? err.message : 'Network error';
    record.retry_count += 1;
  }

  await db.put('sync_queue', record);
}

/** Retry all failed and pending records with exponential backoff */
export async function syncAll(): Promise<{ synced: number; failed: number }> {
  const db = await getDB();
  const pending = await db.getAllFromIndex('sync_queue', 'by-status', 'pending');
  const failed = await db.getAllFromIndex('sync_queue', 'by-status', 'failed');
  const toSync = [...pending, ...failed].filter(r => {
    // Exponential backoff: wait 2^retry_count seconds
    if (r.retry_count > 0) {
      const waitMs = Math.min(2 ** r.retry_count * 1000, 300_000); // max 5 min
      const lastAttempt = new Date(r.synced_at || r.created_at).getTime();
      if (Date.now() - lastAttempt < waitMs) return false;
    }
    return true;
  });

  let syncedCount = 0;
  let failedCount = 0;
  for (const record of toSync) {
    await syncOne(record.id);
    const updated = await db.get('sync_queue', record.id);
    if (updated?.status === 'synced') syncedCount++;
    else failedCount++;
  }

  return { synced: syncedCount, failed: failedCount };
}

/** Count pending + failed records */
export async function pendingCount(): Promise<number> {
  const db = await getDB();
  const pending = await db.countFromIndex('sync_queue', 'by-status', 'pending');
  const failed = await db.countFromIndex('sync_queue', 'by-status', 'failed');
  return pending + failed;
}
