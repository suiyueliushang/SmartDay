// IndexedDB 数据层：单例连接 + 通用仓储
import { openDB, IDBPDatabase } from "idb";
import type { BaseEntity } from "@/types";

const DB_NAME = "smartday-db";
const DB_VERSION = 1;

export type StoreName =
  | "settings"
  | "meta"
  | "categories"
  | "events"
  | "lists"
  | "groups"
  | "tasks"
  | "diaries"
  | "notes"
  | "anniversaries"
  | "focus"
  | "notifications"
  | "reminderLog";

const STORES: Array<{ name: StoreName; keyPath: string }> = [
  { name: "settings", keyPath: "id" },
  { name: "meta", keyPath: "id" },
  { name: "categories", keyPath: "id" },
  { name: "events", keyPath: "id" },
  { name: "lists", keyPath: "id" },
  { name: "groups", keyPath: "id" },
  { name: "tasks", keyPath: "id" },
  { name: "diaries", keyPath: "id" },
  { name: "notes", keyPath: "id" },
  { name: "anniversaries", keyPath: "id" },
  { name: "focus", keyPath: "id" },
  { name: "notifications", keyPath: "id" },
  { name: "reminderLog", keyPath: "key" },
];

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        for (const s of STORES) {
          if (!db.objectStoreNames.contains(s.name)) {
            db.createObjectStore(s.name, { keyPath: s.keyPath });
          }
        }
      },
    });
  }
  return dbPromise;
}

export async function dbReady(): Promise<void> {
  await getDB();
}

export class Repo<T = BaseEntity> {
  constructor(private store: StoreName) {}

  async getAll(): Promise<T[]> {
    const db = await getDB();
    return (await db.getAll(this.store)) as T[];
  }

  async get(id: string): Promise<T | undefined> {
    const db = await getDB();
    return (await db.get(this.store, id)) as T | undefined;
  }

  async put(item: T): Promise<void> {
    const db = await getDB();
    await db.put(this.store, item as never);
  }

  async bulkPut(items: T[]): Promise<void> {
    if (!items.length) return;
    const db = await getDB();
    const tx = db.transaction(this.store, "readwrite");
    for (const item of items) await tx.store.put(item as never);
    await tx.done;
  }

  async delete(id: string): Promise<void> {
    const db = await getDB();
    await db.delete(this.store, id);
  }

  async clear(): Promise<void> {
    const db = await getDB();
    await db.clear(this.store);
  }

  async count(): Promise<number> {
    const db = await getDB();
    return db.count(this.store);
  }
}

export const repos = {
  settings: new Repo<{ id: string; value: unknown }>("settings"),
  meta: new Repo<{ id: string; value: unknown }>("meta"),
  categories: new Repo("categories"),
  events: new Repo("events"),
  lists: new Repo("lists"),
  groups: new Repo("groups"),
  tasks: new Repo("tasks"),
  diaries: new Repo("diaries"),
  notes: new Repo("notes"),
  anniversaries: new Repo("anniversaries"),
  focus: new Repo("focus"),
  notifications: new Repo("notifications"),
  reminderLog: new Repo<{ key: string; at: number }>("reminderLog"),
};

export type RepoKey = keyof typeof repos;
