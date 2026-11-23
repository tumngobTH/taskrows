import type { Account, Layout, ListKey, Settings, Task, TaskKey, TaskList } from "../types";
import { deleteJson, readJson, writeJson } from "../lib/tauri";

export interface CacheSnapshot {
  lists: Record<ListKey, TaskList>;
  tasks: Record<TaskKey, Task>;
}

export interface Persistence {
  loadSettings(): Promise<Settings | null>;
  saveSettings(s: Settings): Promise<void>;
  loadLayout(): Promise<Layout | null>;
  saveLayout(l: Layout): Promise<void>;
  loadCache(): Promise<CacheSnapshot | null>;
  saveCache(c: CacheSnapshot): Promise<void>;
  loadAccounts(): Promise<Account[]>;
  saveAccounts(a: Account[]): Promise<void>;
  clearAll(): Promise<void>;
}

const FILES = {
  settings: "settings.json",
  layout: "layout.json",
  cache: "cache.json",
  accounts: "accounts.json",
} as const;

function parse<T>(raw: string | null | undefined): T | null {
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function build(read: (name: string) => Promise<string | null>, write: (name: string, json: string) => Promise<void>) {
  return {
    loadSettings: async () => parse<Settings>(await read(FILES.settings)),
    saveSettings: (s: Settings) => write(FILES.settings, JSON.stringify(s)),
    loadLayout: async () => parse<Layout>(await read(FILES.layout)),
    saveLayout: (l: Layout) => write(FILES.layout, JSON.stringify(l)),
    loadCache: async () => parse<CacheSnapshot>(await read(FILES.cache)),
    saveCache: (c: CacheSnapshot) => write(FILES.cache, JSON.stringify(c)),
    loadAccounts: async () => parse<Account[]>(await read(FILES.accounts)) ?? [],
    saveAccounts: (a: Account[]) => write(FILES.accounts, JSON.stringify(a)),
  };
}

const DEBOUNCE_MS = 500;

/** Real adapter: JSON files in the app data dir via Tauri commands; saves are debounced per file (trailing). */
export function createTauriPersistence(): Persistence {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const write = async (name: string, json: string) => {
    const prev = timers.get(name);
    if (prev !== undefined) clearTimeout(prev);
    timers.set(
      name,
      setTimeout(() => {
        timers.delete(name);
        writeJson(name, json).catch((e) => console.error(`write ${name} failed`, e));
      }, DEBOUNCE_MS),
    );
  };
  return {
    ...build(readJson, write),
    async clearAll() {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      await Promise.all(Object.values(FILES).map((f) => deleteJson(f)));
    },
  };
}

/** In-memory adapter for tests: synchronous saves into a Map of file name → JSON text. */
export function createMemoryPersistence(): Persistence & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    ...build(
      async (name) => files.get(name) ?? null,
      async (name, json) => {
        files.set(name, json);
      },
    ),
    async clearAll() {
      files.clear();
    },
  };
}
