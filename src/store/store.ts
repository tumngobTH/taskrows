import { createStore, type StoreApi } from "zustand/vanilla";
import { useStore } from "zustand";
import type {
  Account,
  AccountId,
  Group,
  Layout,
  ListKey,
  Settings,
  SlotKey,
  SyncStatus,
  Task,
  TaskKey,
  TaskList,
} from "../types";
import { DEFAULT_SETTINGS } from "../types";
import { listKey, parseListKey, taskKey } from "../lib/ids";
import * as L from "../layout/layout";
import { childrenOf, replaceListTasks, upsertTasks } from "../sync/merge";
import { ApiError, type TasksApi } from "../api/tasksApi";
import type { CacheSnapshot, Persistence } from "../layout/persistence";
import { removeAccount as removeAccountSecrets } from "../lib/tauri";

export interface State {
  accounts: Account[];
  lists: Record<ListKey, TaskList>;
  tasks: Record<TaskKey, Task>;
  groups: Group[];
  layout: Layout;
  settings: Settings;
  sync: SyncStatus;
  writesEnabled: boolean;
  toasts: { id: string; text: string }[];
}

export interface Actions {
  hydrate(cache: CacheSnapshot | null, layout: Layout | null, settings: Settings | null, accounts: Account[]): void;
  setLists(accountId: AccountId, lists: TaskList[]): void;
  applyListTasks(listKey: ListKey, tasks: Task[], full: boolean): void;
  addTask(slotKey: SlotKey, title: string): Promise<void>;
  toggleComplete(taskKey: TaskKey): Promise<void>;
  updateTask(taskKey: TaskKey, patch: { title?: string; notes?: string | null; due?: string | null }): Promise<void>;
  deleteTask(taskKey: TaskKey): Promise<void>;
  moveTask(taskKey: TaskKey, to: { listKey: ListKey; previousTaskId: string | null; parentId?: string | null }): Promise<void>;
  addRow(): void;
  removeRow(rowId: string): void;
  moveSlot(slotKey: SlotKey, toRowId: string, toIndex: number): void;
  setRowHeights(fractions: number[]): void;
  setNewTaskTarget(slotKey: SlotKey, accountId: AccountId): void;
  updateSettings(patch: Partial<Settings>): void;
  setAccountColor(accountId: AccountId, color: string): void;
  addAccountFromSignIn(info: { id: string; email: string }): void;
  markReauth(accountId: AccountId): void;
  removeAccount(accountId: AccountId): Promise<void>;
  toast(text: string): void;
  setSync(patch: Partial<SyncStatus>): void;
  persistCache(): void; // used by the sync engine after a successful cycle
}

export type TaskStore = StoreApi<State & Actions>;

export const ACCOUNT_COLORS = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#0891b2"];
const MAX_ACCOUNTS = 3;
type Tasks = Record<TaskKey, Task>;

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Groups + reconciled layout for a set of lists. */
function regroup(lists: Record<ListKey, TaskList>, layout: Layout, mergeSameName: boolean) {
  const groups = L.resolveGroups(Object.values(lists), mergeSameName);
  return { groups, layout: L.reconcileLayout(layout, groups) };
}

export function createTaskStore(deps: { api: TasksApi; persist: Persistence; now?: () => number }): TaskStore {
  const { api, persist } = deps;
  const now = deps.now ?? Date.now;

  return createStore<State & Actions>()((set, get) => {
    const saveLayout = () => void persist.saveLayout(get().layout);
    const saveCache = () => void persist.saveCache({ lists: get().lists, tasks: get().tasks });
    const saveAccounts = () => void persist.saveAccounts(get().accounts);
    const withLayout = (fn: (l: Layout) => Layout) => {
      set({ layout: fn(get().layout) });
      saveLayout();
    };

    /**
     * Optimistic write. `changes` maps each touched key to its new value (undefined = remove).
     * On failure only those keys are reverted, and only if nobody else changed them since,
     * so concurrent writes and poll merges are kept.
     */
    async function optimistic(changes: Record<TaskKey, Task | undefined>, call: () => Promise<(t: Tasks) => Tasks>) {
      const before = get().tasks;
      const keys = Object.keys(changes);
      const applied = { ...before };
      for (const k of keys) {
        if (changes[k] === undefined) delete applied[k];
        else applied[k] = changes[k] as Task;
      }
      set({ tasks: applied });
      try {
        const merge = await call();
        set((s) => ({ tasks: merge(s.tasks) }));
      } catch (e) {
        set((s) => {
          const t = { ...s.tasks };
          for (const k of keys) {
            if (t[k] !== applied[k]) continue; // changed by someone else since: keep theirs
            if (before[k] === undefined) delete t[k];
            else t[k] = before[k];
          }
          return { tasks: t };
        });
        get().toast(errText(e));
      }
    }

    const patched = (task: Task, patch: Partial<Task>) => ({ [taskKey(task.accountId, task.id)]: { ...task, ...patch } });

    /** Writes are disabled until the first sync completes. */
    const canWrite = () => {
      if (get().writesEnabled) return true;
      get().toast("Still syncing — try again in a moment");
      return false;
    };

    return {
      accounts: [],
      lists: {},
      tasks: {},
      groups: [],
      layout: L.emptyLayout(),
      settings: DEFAULT_SETTINGS,
      sync: { phase: "idle", backoffMs: 0 },
      writesEnabled: false,
      toasts: [],

      hydrate(cache, layout, settings, accounts) {
        const s = { ...DEFAULT_SETTINGS, ...settings };
        const lists = cache?.lists ?? {};
        set({ accounts, lists, tasks: cache?.tasks ?? {}, settings: s, ...regroup(lists, layout ?? L.emptyLayout(), s.mergeSameName) });
      },

      setLists(accountId, incoming) {
        if (!get().accounts.some((a) => a.id === accountId)) return; // account removed mid-sync
        const lists: Record<ListKey, TaskList> = {};
        for (const [k, l] of Object.entries(get().lists)) if (l.accountId !== accountId) lists[k] = l;
        for (const l of incoming) lists[listKey(l.accountId, l.id)] = l;
        const tasks: Tasks = {};
        for (const [k, t] of Object.entries(get().tasks)) if (lists[listKey(t.accountId, t.listId)]) tasks[k] = t;
        set({ lists, tasks, ...regroup(lists, get().layout, get().settings.mergeSameName) });
        saveLayout();
      },

      applyListTasks(key, incoming, full) {
        const { accountId } = parseListKey(key);
        if (!get().accounts.some((a) => a.id === accountId)) return; // account removed mid-sync
        set((s) => ({ tasks: full ? replaceListTasks(s.tasks, key, incoming) : upsertTasks(s.tasks, incoming) }));
      },

      // ---- optimistic task writes ----
      async addTask(slotKey, title) {
        if (!canWrite()) return;
        const group = get().groups.find((g) => g.key === slotKey);
        if (!group) return;
        const accountId = L.targetAccount(get().layout, group);
        const member = group.members.find((m) => parseListKey(m).accountId === accountId);
        if (!member) return;
        const { listId } = parseListKey(member);
        const tmpId = `tmp:${crypto.randomUUID()}`;
        const tmpKey = taskKey(accountId, tmpId);
        const temp: Task = {
          accountId,
          listId,
          id: tmpId,
          title,
          status: "needsAction",
          updated: new Date(now()).toISOString(),
          position: "",
        };
        await optimistic({ [tmpKey]: temp }, async () => {
          const created = await api.insertTask(accountId, listId, { title });
          return (t) => {
            const { [tmpKey]: _gone, ...rest } = t;
            return upsertTasks(rest, [created]);
          };
        });
      },

      async toggleComplete(key) {
        if (!canWrite()) return;
        const task = get().tasks[key];
        if (!task) return;
        if (task.status === "completed") {
          await optimistic(patched(task, { status: "needsAction", completed: undefined }), async () => {
            const r = await api.patchTask(task.accountId, task.listId, task.id, { status: "needsAction", completed: null });
            return (t) => upsertTasks(t, [r]);
          });
          return;
        }
        const targets = [task, ...childrenOf(get().tasks, task).filter((c) => c.status !== "completed")];
        const stamp = new Date(now()).toISOString();
        const changes = Object.assign({}, ...targets.map((x) => patched(x, { status: "completed", completed: stamp })));
        await optimistic(changes, async () => {
          const results: Task[] = [];
          for (const x of targets) results.push(await api.patchTask(x.accountId, x.listId, x.id, { status: "completed" }));
          return (t) => upsertTasks(t, results);
        });
      },

      async updateTask(key, patch) {
        if (!canWrite()) return;
        const task = get().tasks[key];
        if (!task) return;
        const local: Partial<Task> = {};
        if (patch.title !== undefined) local.title = patch.title;
        if (patch.notes !== undefined) local.notes = patch.notes ?? undefined;
        if (patch.due !== undefined) local.due = patch.due ?? undefined;
        await optimistic(patched(task, local), async () => {
          const r = await api.patchTask(task.accountId, task.listId, task.id, patch);
          return (t) => upsertTasks(t, [r]);
        });
      },

      async deleteTask(key) {
        if (!canWrite()) return;
        const task = get().tasks[key];
        if (!task) return;
        await optimistic({ [key]: undefined }, async () => {
          await api.deleteTask(task.accountId, task.listId, task.id);
          return (t) => t;
        });
      },

      async moveTask(key, to) {
        if (!canWrite()) return;
        const task = get().tasks[key];
        if (!task) return;
        const dest = parseListKey(to.listKey);
        if (dest.accountId !== task.accountId) {
          get().toast("Can't move tasks between accounts");
          return;
        }
        const opts: { previous?: string; parent?: string; destinationTasklist?: string } = {};
        if (to.previousTaskId) opts.previous = to.previousTaskId;
        if (to.parentId) opts.parent = to.parentId;
        if (dest.listId !== task.listId) opts.destinationTasklist = dest.listId;
        // A parent moved to another list takes its subtasks (open and completed) with it.
        const children = opts.destinationTasklist ? childrenOf(get().tasks, task) : [];
        const changes = Object.assign(
          patched(task, { listId: dest.listId, parent: to.parentId ?? undefined }),
          ...children.map((c) => patched(c, { listId: dest.listId, parent: task.id })),
        );
        await optimistic(changes, async () => {
          const results = [await api.moveTask(task.accountId, task.listId, task.id, opts)];
          let previous: string | undefined;
          for (const c of children) {
            const childOpts: { previous?: string; parent?: string; destinationTasklist?: string } = {
              destinationTasklist: dest.listId,
              parent: task.id,
            };
            if (previous) childOpts.previous = previous;
            try {
              results.push(await api.moveTask(task.accountId, task.listId, c.id, childOpts));
              previous = c.id;
            } catch (e) {
              if (!(e instanceof ApiError && e.status === 404)) throw e; // 404: already moved by Google
            }
          }
          return (t) => upsertTasks(t, results);
        });
      },

      // ---- layout (Task 5 reducers + persist) ----
      addRow: () => withLayout(L.addRow),
      removeRow: (rowId) => withLayout((l) => L.removeRow(l, rowId)),
      moveSlot: (slotKey, toRowId, toIndex) => withLayout((l) => L.moveSlot(l, slotKey, toRowId, toIndex)),
      setRowHeights: (fractions) => withLayout((l) => L.setRowHeights(l, fractions)),
      setNewTaskTarget: (slotKey, accountId) => withLayout((l) => L.setNewTaskTarget(l, slotKey, accountId)),

      updateSettings(patch) {
        const prev = get().settings;
        const settings = { ...prev, ...patch };
        set({ settings });
        if (settings.mergeSameName !== prev.mergeSameName) {
          set(regroup(get().lists, get().layout, settings.mergeSameName));
          saveLayout();
        }
        void persist.saveSettings(settings);
      },

      // ---- accounts ----
      addAccountFromSignIn(info) {
        const accounts = get().accounts;
        if (accounts.some((a) => a.id === info.id)) {
          set({ accounts: accounts.map((a) => (a.id === info.id ? { ...a, email: info.email, needsReauth: false } : a)) });
        } else {
          if (accounts.length >= MAX_ACCOUNTS) return;
          const used = new Set(accounts.map((a) => a.color));
          const color = ACCOUNT_COLORS.find((c) => !used.has(c)) ?? ACCOUNT_COLORS[0];
          set({ accounts: [...accounts, { id: info.id, email: info.email, color, needsReauth: false }] });
        }
        saveAccounts();
      },

      setAccountColor(accountId, color) {
        set({ accounts: get().accounts.map((a) => (a.id === accountId ? { ...a, color } : a)) });
        saveAccounts();
      },

      markReauth(accountId) {
        const acc = get().accounts.find((a) => a.id === accountId);
        if (acc && !acc.needsReauth) get().toast(`Google sign-in expired for ${acc.email} — open Settings to sign in again`);
        set({ accounts: get().accounts.map((a) => (a.id === accountId ? { ...a, needsReauth: true } : a)) });
        saveAccounts();
      },

      async removeAccount(accountId) {
        const s = get();
        const lists: Record<ListKey, TaskList> = {};
        for (const [k, l] of Object.entries(s.lists)) if (l.accountId !== accountId) lists[k] = l;
        const tasks: Tasks = {};
        for (const [k, t] of Object.entries(s.tasks)) if (t.accountId !== accountId) tasks[k] = t;
        const newTaskTarget: Layout["newTaskTarget"] = {};
        for (const [k, v] of Object.entries(s.layout.newTaskTarget)) if (v !== accountId) newTaskTarget[k] = v;
        set({
          accounts: s.accounts.filter((a) => a.id !== accountId),
          lists,
          tasks,
          ...regroup(lists, { ...s.layout, newTaskTarget }, s.settings.mergeSameName),
        });
        saveAccounts();
        saveLayout();
        saveCache();
        try {
          await removeAccountSecrets(accountId);
        } catch (e) {
          get().toast(errText(e));
        }
      },

      toast(text) {
        set((s) => ({ toasts: [...s.toasts, { id: crypto.randomUUID(), text }] }));
      },

      setSync(patch) {
        set((s) => ({ sync: { ...s.sync, ...patch } }));
      },

      persistCache: saveCache,
    };
  });
}

// ---- React binding to the single app instance ----
let appStore: TaskStore | null = null;

export function setAppStore(store: TaskStore): void {
  appStore = store;
}

export function getAppStore(): TaskStore {
  if (!appStore) throw new Error("app store not initialised");
  return appStore;
}

export function useTaskStore<T>(selector: (s: State & Actions) => T): T {
  return useStore(getAppStore(), selector);
}
