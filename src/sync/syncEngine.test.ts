import { vi } from "vitest";
import type { Account, Task, TaskList } from "../types";
import { ApiError, type TasksApi } from "../api/tasksApi";
import { createMemoryPersistence } from "../layout/persistence";
import { listKey, taskKey } from "../lib/ids";
import { createTaskStore } from "../store/store";
import { SyncEngine, type Clock } from "./syncEngine";

vi.mock("../lib/tauri", () => ({ removeAccount: vi.fn(async () => {}) }));

const T0 = Date.parse("2026-11-24T00:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const DAY = 86_400_000;

const acct = (id: string): Account => ({ id, email: `${id}@x.com`, color: "#2563eb", needsReauth: false });
const tl = (accountId: string, id: string, updated = "2026-11-01T00:00:00Z"): TaskList => ({
  accountId,
  id,
  title: `List ${accountId}${id}`,
  updated,
});
const task = (accountId: string, listId: string, id: string, extra: Partial<Task> = {}): Task => ({
  accountId,
  listId,
  id,
  title: id,
  status: "needsAction",
  updated: "2026-11-01T00:00:00Z",
  position: "00000000000000000001",
  ...extra,
});

function fakeClock() {
  let seq = 0;
  const c = {
    t: T0,
    timers: [] as { id: number; at: number; ms: number; fn: () => void }[],
    now: () => c.t,
    setTimeout(fn: () => void, ms: number) {
      const id = ++seq;
      c.timers.push({ id, at: c.t + ms, ms, fn });
      return id;
    },
    clearTimeout(h: unknown) {
      c.timers = c.timers.filter((x) => x.id !== h);
    },
    async advance(ms: number) {
      c.t += ms;
      const due = c.timers.filter((x) => x.at <= c.t);
      c.timers = c.timers.filter((x) => x.at > c.t);
      for (const d of due) d.fn();
      await new Promise((r) => setTimeout(r, 0));
    },
  };
  return c satisfies Clock & Record<string, unknown>;
}

type Remote = Record<string, { lists: TaskList[]; tasks: Record<string, Task[]> }>;

function fakeApi(remote: Remote, fail: Record<string, () => unknown> = {}) {
  return {
    listTaskLists: vi.fn(async (a: string) => {
      if (fail[a]) throw fail[a]();
      return remote[a].lists.map((l) => ({ ...l }));
    }),
    // Mirrors Google: showCompleted=false -> open only; completedMin -> completed only (no completion date = excluded).
    listTasks: vi.fn(async (a: string, l: string, opts: { showCompleted?: boolean; completedMin?: string }) => {
      const all = remote[a].tasks[l] ?? [];
      if (opts.showCompleted === false) return all.filter((t) => t.status !== "completed");
      if (opts.completedMin) return all.filter((t) => t.status === "completed");
      return all;
    }),
    insertTask: vi.fn(),
    patchTask: vi.fn(),
    deleteTask: vi.fn(),
    moveTask: vi.fn(),
  };
}

function setup(remote: Remote, fail: Record<string, () => unknown> = {}, opts: { skipUnchangedLists?: boolean } = {}) {
  const api = fakeApi(remote, fail);
  const persist = createMemoryPersistence();
  const clock = fakeClock();
  const store = createTaskStore({ api: api as unknown as TasksApi, persist, now: clock.now });
  store.getState().hydrate(null, null, null, Object.keys(remote).map(acct));
  const engine = new SyncEngine(store, api as unknown as TasksApi, clock, opts);
  return { api, persist, clock, store, engine };
}

const twoAccounts = (): Remote => ({
  a: { lists: [tl("a", "L1")], tasks: { L1: [task("a", "L1", "t1")] } },
  b: { lists: [tl("b", "M1")], tasks: { M1: [task("b", "M1", "u1")] } },
});

describe("syncEngine", () => {
  it("start_fetches_all_and_enables_writes", async () => {
    const { api, persist, clock, store, engine } = setup(twoAccounts());
    await engine.start();
    const s = store.getState();
    expect(Object.keys(s.lists).sort()).toEqual([listKey("a", "L1"), listKey("b", "M1")]);
    expect(Object.keys(s.tasks).sort()).toEqual([taskKey("a", "t1"), taskKey("b", "u1")]);
    expect(s.writesEnabled).toBe(true);
    expect(s.sync).toMatchObject({ phase: "idle", lastSyncAt: T0, backoffMs: 0 });
    expect(api.listTasks).toHaveBeenCalledWith("a", "L1", { showCompleted: false });
    expect(api.listTasks).toHaveBeenCalledWith("a", "L1", { completedMin: iso(T0 - 30 * DAY) });
    expect(Object.keys((await persist.loadCache())?.tasks ?? {}).sort()).toEqual([taskKey("a", "t1"), taskKey("b", "u1")]);
    expect(clock.timers.map((t) => t.ms)).toEqual([60_000]);
    engine.stop();
    expect(clock.timers).toEqual([]);
  });

  it("offline_at_start_keeps_cache_and_disables_writes", async () => {
    const remote: Remote = { a: { lists: [tl("a", "L1")], tasks: {} } };
    const { clock, store, engine } = setup(remote, { a: () => new TypeError("Failed to fetch") });
    store.getState().hydrate(
      { lists: { [listKey("a", "L1")]: tl("a", "L1") }, tasks: { [taskKey("a", "c1")]: task("a", "L1", "c1") } },
      null,
      null,
      [acct("a")],
    );
    await engine.start();
    const s = store.getState();
    expect(Object.keys(s.tasks)).toEqual([taskKey("a", "c1")]);
    expect(s.writesEnabled).toBe(false);
    expect(s.sync.phase).toBe("offline");
    expect(clock.timers.map((t) => t.ms)).toEqual([60_000]);
    engine.stop();
  });

  it("reauth_isolated_to_one_account", async () => {
    const { api, store, engine } = setup(twoAccounts(), { a: () => new Error("reauth_required") });
    await engine.start();
    let s = store.getState();
    expect(s.accounts.find((a) => a.id === "a")?.needsReauth).toBe(true);
    expect(s.accounts.find((a) => a.id === "b")?.needsReauth).toBe(false);
    expect(Object.keys(s.tasks)).toEqual([taskKey("b", "u1")]);
    expect(s.sync.phase).toBe("idle");
    expect(s.writesEnabled).toBe(true);

    api.listTaskLists.mockClear();
    await engine.syncNow();
    expect(api.listTaskLists.mock.calls.map((c) => c[0])).toEqual(["b"]);
    s = store.getState();
    expect(s.sync.phase).toBe("idle");
    engine.stop();
  });

  it("rate_limit_backs_off_and_recovers", async () => {
    const fail: Record<string, () => unknown> = {};
    const { clock, store, engine } = setup(twoAccounts(), fail);
    await engine.start();

    fail.a = () => new ApiError(403, "rateLimitExceeded", "Rate Limit Exceeded");
    await engine.syncNow();
    expect(store.getState().sync.backoffMs).toBe(120_000);
    expect(clock.timers.map((t) => t.ms)).toEqual([180_000]);

    fail.a = () => new ApiError(429, "", "Too Many Requests");
    await engine.syncNow();
    expect(store.getState().sync.backoffMs).toBe(240_000);
    expect(clock.timers.map((t) => t.ms)).toEqual([300_000]);
    expect(store.getState().toasts).toHaveLength(1);

    delete fail.a;
    await clock.advance(300_000);
    const s = store.getState();
    expect(s.sync).toMatchObject({ phase: "idle", backoffMs: 0, lastSyncAt: T0 + 300_000 });
    expect(clock.timers.map((t) => t.ms)).toEqual([60_000]);
    engine.stop();
  });

  it("skips_unchanged_lists_and_full_refreshes_every_10th", async () => {
    const remote: Remote = {
      a: {
        lists: [tl("a", "L1"), tl("a", "L2")],
        tasks: { L1: [task("a", "L1", "t1"), task("a", "L1", "gone")], L2: [task("a", "L2", "t2")] },
      },
    };
    const { api, clock, store, engine } = setup(remote, {}, { skipUnchangedLists: true });
    await engine.start(); // cycle 0: full
    api.listTasks.mockClear();

    clock.t += 60_000;
    remote.a.lists[0] = tl("a", "L1", "2026-11-24T00:00:30Z");
    remote.a.tasks.L1 = [task("a", "L1", "gone", { deleted: true })];
    await engine.syncNow(); // cycle 1: incremental, only L1 changed
    expect(api.listTasks).toHaveBeenCalledTimes(1);
    expect(api.listTasks).toHaveBeenCalledWith("a", "L1", { updatedMin: iso(T0 - 5 * 60_000), showDeleted: true });
    expect(Object.keys(store.getState().tasks).sort()).toEqual([taskKey("a", "t1"), taskKey("a", "t2")]);

    api.listTasks.mockClear();
    for (let i = 2; i <= 9; i++) {
      clock.t += 60_000;
      await engine.syncNow();
    }
    expect(api.listTasks).not.toHaveBeenCalled();

    clock.t += 60_000;
    await engine.syncNow(); // cycle 10: full refresh of every list
    expect(api.listTasks.mock.calls.map((c) => [c[1], c[2]])).toEqual([
      ["L1", { showCompleted: false }],
      ["L1", { completedMin: iso(clock.t - 30 * DAY) }],
      ["L2", { showCompleted: false }],
      ["L2", { completedMin: iso(clock.t - 30 * DAY) }],
    ]);
    engine.stop();
  });

  it("default_engine_fetches_every_list_each_incremental_cycle", async () => {
    const remote: Remote = {
      a: { lists: [tl("a", "L1"), tl("a", "L2")], tasks: { L1: [task("a", "L1", "t1")], L2: [task("a", "L2", "t2")] } },
    };
    const { api, clock, engine } = setup(remote);
    await engine.start();
    api.listTasks.mockClear();
    clock.t += 60_000;
    await engine.syncNow(); // incremental, nothing changed
    expect(api.listTasks.mock.calls.map((c) => [c[1], c[2]])).toEqual([
      ["L1", { updatedMin: iso(T0 - 5 * 60_000), showDeleted: true }],
      ["L2", { updatedMin: iso(T0 - 5 * 60_000), showDeleted: true }],
    ]);
    engine.stop();
  });

  it("full_refresh_keeps_open_tasks_and_recent_completed", async () => {
    const remote: Remote = {
      a: {
        lists: [tl("a", "L1")],
        tasks: {
          L1: [
            task("a", "L1", "open1"),
            task("a", "L1", "done1", { status: "completed", completed: iso(T0 - DAY) }),
          ],
        },
      },
    };
    const { store, engine } = setup(remote);
    store.getState().hydrate(
      { lists: { [listKey("a", "L1")]: tl("a", "L1") }, tasks: { [taskKey("a", "stale")]: task("a", "L1", "stale") } },
      null,
      null,
      [acct("a")],
    );
    await engine.start();
    expect(Object.keys(store.getState().tasks).sort()).toEqual([taskKey("a", "done1"), taskKey("a", "open1")]);
    engine.stop();
  });

  it("offline_token_error_at_launch_shows_offline_and_keeps_cache", async () => {
    const remote: Remote = { a: { lists: [tl("a", "L1")], tasks: {} } };
    const { store, engine } = setup(remote, { a: () => new Error("offline") });
    store.getState().hydrate(
      { lists: { [listKey("a", "L1")]: tl("a", "L1") }, tasks: { [taskKey("a", "c1")]: task("a", "L1", "c1") } },
      null,
      null,
      [acct("a")],
    );
    await engine.start();
    const s = store.getState();
    expect(s.sync.phase).toBe("offline");
    expect(Object.keys(s.tasks)).toEqual([taskKey("a", "c1")]);
    expect(s.writesEnabled).toBe(false);
    engine.stop();
  });

  it("writes_enabled_when_at_least_one_account_syncs", async () => {
    const { store, engine } = setup(twoAccounts(), { b: () => new ApiError(500, "backendError", "Boom") });
    await engine.start();
    const s = store.getState();
    expect(s.writesEnabled).toBe(true);
    expect(s.sync.phase).toBe("error");
    engine.stop();
  });

  it("removed_then_readded_account_does_a_full_fetch", async () => {
    const { api, clock, store, engine } = setup({ a: { lists: [tl("a", "L1")], tasks: { L1: [task("a", "L1", "t1")] } } });
    await engine.start();
    await store.getState().removeAccount("a");
    store.getState().addAccountFromSignIn({ id: "a", email: "a@x.com" });
    api.listTasks.mockClear();
    clock.t += 60_000;
    await engine.syncNow();
    expect(api.listTasks.mock.calls.map((c) => c[2])).toEqual([{ showCompleted: false }, { completedMin: iso(clock.t - 30 * DAY) }]);
    expect(Object.keys(store.getState().tasks)).toEqual([taskKey("a", "t1")]);
    engine.stop();
  });

  it("poll_wait_is_capped_at_ten_minutes", async () => {
    const fail: Record<string, () => unknown> = {};
    const { clock, store, engine } = setup(twoAccounts(), fail);
    store.getState().updateSettings({ pollIntervalSec: 300 });
    await engine.start();
    fail.a = () => new ApiError(429, "", "Too Many Requests");
    await engine.syncNow(); // backoff 600_000
    expect(store.getState().sync.backoffMs).toBe(600_000);
    expect(clock.timers.map((t) => t.ms)).toEqual([600_000]);
    engine.stop();
  });
});
