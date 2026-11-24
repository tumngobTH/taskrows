import { vi } from "vitest";
import type { Account, Task, TaskList } from "../types";
import { ApiError, type TasksApi } from "../api/tasksApi";
import { createMemoryPersistence } from "../layout/persistence";
import { listKey, mergedKey, taskKey } from "../lib/ids";
import { createTaskStore } from "./store";
import * as tauri from "../lib/tauri";

vi.mock("../lib/tauri", () => ({ removeAccount: vi.fn(async () => {}) }));

const acct = (id: string, color = "#2563eb"): Account => ({ id, email: `${id}@x.com`, color, needsReauth: false });
const tl = (accountId: string, id: string, title: string): TaskList => ({
  accountId,
  id,
  title,
  updated: "2026-11-01T00:00:00Z",
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

function fakeApi() {
  return {
    listTaskLists: vi.fn(),
    listTasks: vi.fn(),
    insertTask: vi.fn(),
    patchTask: vi.fn(async (_a: string, _l: string, _id: string, patch: Partial<Task>) => patch),
    deleteTask: vi.fn(async () => {}),
    moveTask: vi.fn(),
  };
}

function setup(accounts: Account[] = [acct("a")]) {
  const api = fakeApi();
  const persist = createMemoryPersistence();
  const store = createTaskStore({ api: api as unknown as TasksApi, persist, now: () => Date.parse("2026-11-24T00:00:00Z") });
  store.getState().hydrate(null, null, null, accounts);
  store.setState({ writesEnabled: true });
  return { api, persist, store };
}

describe("store", () => {
  it("addTask_optimistic_then_replaces_temp_id", async () => {
    const { api, store } = setup();
    store.getState().setLists("a", [tl("a", "L1", "Inbox")]);
    let resolve!: (t: Task) => void;
    api.insertTask.mockReturnValue(new Promise<Task>((r) => (resolve = r)));

    const p = store.getState().addTask(listKey("a", "L1"), "Milk");
    const temp = Object.values(store.getState().tasks);
    expect(temp).toHaveLength(1);
    expect(temp[0].id.startsWith("tmp:")).toBe(true);
    expect(temp[0]).toMatchObject({ title: "Milk", position: "", listId: "L1", accountId: "a" });

    resolve(task("a", "L1", "srv1", { title: "Milk" }));
    await p;
    expect(Object.keys(store.getState().tasks)).toEqual([taskKey("a", "srv1")]);
    expect(api.insertTask).toHaveBeenCalledWith("a", "L1", { title: "Milk" });
  });

  it("addTask_failure_reverts_and_toasts", async () => {
    const { api, store } = setup();
    store.getState().setLists("a", [tl("a", "L1", "Inbox")]);
    api.insertTask.mockRejectedValue(new ApiError(500, "backendError", "Boom"));

    await store.getState().addTask(listKey("a", "L1"), "Milk");
    expect(store.getState().tasks).toEqual({});
    expect(store.getState().toasts.map((t) => t.text)).toEqual(["Boom"]);
  });

  it("toggleComplete_parent_cascades_children", async () => {
    const { api, store } = setup();
    store.getState().setLists("a", [tl("a", "L1", "Inbox")]);
    store.getState().applyListTasks(
      listKey("a", "L1"),
      [
        task("a", "L1", "P"),
        task("a", "L1", "C1", { parent: "P" }),
        task("a", "L1", "C2", { parent: "P", status: "completed", completed: "2026-11-02T00:00:00Z" }),
        task("a", "L1", "O"),
      ],
      true,
    );
    api.patchTask.mockImplementation(async (_a, _l, id, patch) => ({
      ...store.getState().tasks[taskKey("a", id)],
      ...patch,
      completed: patch.status === "completed" ? "2026-11-24T00:00:00Z" : undefined,
    }));

    await store.getState().toggleComplete(taskKey("a", "P"));
    const t = store.getState().tasks;
    expect(t[taskKey("a", "P")].status).toBe("completed");
    expect(t[taskKey("a", "C1")].status).toBe("completed");
    expect(t[taskKey("a", "O")].status).toBe("needsAction");
    expect(api.patchTask.mock.calls.map((c) => c[2])).toEqual(["P", "C1"]);
    expect(api.patchTask.mock.calls[0][3]).toEqual({ status: "completed" });

    api.patchTask.mockClear();
    await store.getState().toggleComplete(taskKey("a", "P"));
    expect(api.patchTask).toHaveBeenCalledTimes(1);
    expect(api.patchTask).toHaveBeenCalledWith("a", "L1", "P", { status: "needsAction", completed: null });
    expect(store.getState().tasks[taskKey("a", "P")].status).toBe("needsAction");
    expect(store.getState().tasks[taskKey("a", "C1")].status).toBe("completed");
  });

  it("setLists_merges_same_name_in_place_of_its_member", async () => {
    const { persist, store } = setup([acct("a"), acct("b", "#16a34a")]);
    store.getState().addRow();
    store.getState().setLists("a", [tl("a", "g1", "Groceries"), tl("a", "w", "Work")]);
    store.getState().setLists("b", [tl("b", "g2", " groceries ")]);

    const s = store.getState();
    const merged = s.groups.find((g) => g.key === mergedKey("Groceries"));
    expect(merged?.members).toEqual([listKey("a", "g1"), listKey("b", "g2")]);
    expect(s.groups.map((g) => g.key)).toEqual([mergedKey("Groceries"), listKey("a", "w")]);
    expect(s.layout.rows[0].slots).toEqual([mergedKey("Groceries"), listKey("a", "w")]); // takes a:g1's slot
    expect(s.layout.rows[1].slots).toEqual([]);
    expect(await persist.loadLayout()).toEqual(s.layout);
  });

  it("updateSettings_merge_off_splits_groups", async () => {
    const { persist, store } = setup([acct("a"), acct("b", "#16a34a")]);
    store.getState().setLists("a", [tl("a", "g1", "Groceries")]);
    store.getState().setLists("b", [tl("b", "g2", "Groceries")]);
    expect(store.getState().groups.map((g) => g.key)).toEqual([mergedKey("Groceries")]);

    store.getState().updateSettings({ mergeSameName: false });
    const s = store.getState();
    expect(s.groups.map((g) => g.key)).toEqual([listKey("a", "g1"), listKey("b", "g2")]);
    expect(s.layout.rows[0].slots).toEqual([listKey("a", "g1"), listKey("b", "g2")]);
    expect((await persist.loadSettings())?.mergeSameName).toBe(false);
  });

  it("removeAccount_drops_its_lists_tasks_slots", async () => {
    const { persist, store } = setup([acct("a"), acct("b", "#16a34a")]);
    store.getState().setLists("a", [tl("a", "g1", "Groceries"), tl("a", "w", "Work")]);
    store.getState().setLists("b", [tl("b", "g2", "Groceries"), tl("b", "x", "Extra")]);
    store.getState().applyListTasks(listKey("a", "g1"), [task("a", "g1", "t1")], true);
    store.getState().applyListTasks(listKey("b", "g2"), [task("b", "g2", "t2")], true);
    store.getState().setNewTaskTarget(mergedKey("Groceries"), "b");

    await store.getState().removeAccount("b");
    const s = store.getState();
    expect(s.accounts.map((a) => a.id)).toEqual(["a"]);
    expect(Object.keys(s.lists)).toEqual([listKey("a", "g1"), listKey("a", "w")]);
    expect(Object.keys(s.tasks)).toEqual([taskKey("a", "t1")]);
    expect(s.layout.rows.flatMap((r) => r.slots).sort()).toEqual([listKey("a", "g1"), listKey("a", "w")].sort());
    expect(s.layout.newTaskTarget).toEqual({});
    expect(tauri.removeAccount).toHaveBeenCalledWith("b");
    expect((await persist.loadAccounts()).map((a) => a.id)).toEqual(["a"]);
    expect(Object.keys((await persist.loadCache())?.tasks ?? {})).toEqual([taskKey("a", "t1")]);
  });

  it("failed_write_reverts_only_its_own_keys_after_overlapping_add", async () => {
    const { api, store } = setup();
    store.getState().setLists("a", [tl("a", "L1", "Inbox")]);
    let resolveAdd!: (t: Task) => void;
    let rejectToggle!: (e: Error) => void;
    api.insertTask.mockReturnValue(new Promise<Task>((r) => (resolveAdd = r)));
    api.patchTask.mockReturnValue(new Promise((_r, j) => (rejectToggle = j)));

    const add = store.getState().addTask(listKey("a", "L1"), "Milk");
    const tmpKey = Object.keys(store.getState().tasks)[0];
    const toggle = store.getState().toggleComplete(tmpKey);
    resolveAdd(task("a", "L1", "srv1", { title: "Milk" }));
    await add;
    rejectToggle(new Error("Nope"));
    await toggle;

    const keys = Object.keys(store.getState().tasks);
    expect(keys).toEqual([taskKey("a", "srv1")]);
    expect(keys.some((k) => k.includes("tmp:"))).toBe(false);
    expect(store.getState().toasts.map((t) => t.text)).toEqual(["Nope"]);
  });

  it("poll_merge_during_failing_write_survives_revert", async () => {
    const { api, store } = setup();
    store.getState().setLists("a", [tl("a", "L1", "Inbox")]);
    store.getState().applyListTasks(listKey("a", "L1"), [task("a", "L1", "t1"), task("a", "L1", "t2")], true);
    let reject!: (e: Error) => void;
    api.patchTask.mockReturnValue(new Promise((_r, j) => (reject = j)));

    const p = store.getState().updateTask(taskKey("a", "t1"), { title: "Renamed" });
    expect(store.getState().tasks[taskKey("a", "t1")].title).toBe("Renamed");
    store.getState().applyListTasks(
      listKey("a", "L1"),
      [task("a", "L1", "t2", { title: "t2 from server" }), task("a", "L1", "t3")],
      false,
    );
    reject(new Error("Offline"));
    await p;

    const t = store.getState().tasks;
    expect(t[taskKey("a", "t1")].title).toBe("t1");
    expect(t[taskKey("a", "t2")].title).toBe("t2 from server");
    expect(t[taskKey("a", "t3")]).toBeDefined();
  });

  it("failed_delete_restores_the_task", async () => {
    const { api, store } = setup();
    store.getState().setLists("a", [tl("a", "L1", "Inbox")]);
    store.getState().applyListTasks(listKey("a", "L1"), [task("a", "L1", "t1")], true);
    api.deleteTask.mockRejectedValue(new Error("Nope"));
    await store.getState().deleteTask(taskKey("a", "t1"));
    expect(store.getState().tasks[taskKey("a", "t1")]).toBeDefined();
  });

  it("moveTask_cross_list_sends_destination_and_reorder_does_not", async () => {
    const { api, store } = setup();
    store.getState().setLists("a", [tl("a", "L1", "Inbox"), tl("a", "L2", "Work")]);
    store.getState().applyListTasks(listKey("a", "L1"), [task("a", "L1", "t1"), task("a", "L1", "t0")], true);
    api.moveTask.mockImplementation(async (_a, _l, id, opts) => task("a", opts.destinationTasklist ?? "L1", id));

    await store.getState().moveTask(taskKey("a", "t1"), { listKey: listKey("a", "L2"), previousTaskId: null });
    expect(api.moveTask).toHaveBeenLastCalledWith("a", "L1", "t1", { destinationTasklist: "L2" });
    expect(store.getState().tasks[taskKey("a", "t1")].listId).toBe("L2");

    await store.getState().moveTask(taskKey("a", "t0"), { listKey: listKey("a", "L1"), previousTaskId: "x9" });
    expect(api.moveTask).toHaveBeenLastCalledWith("a", "L1", "t0", { previous: "x9" });
  });

  it("moveTask_rejects_cross_account_drop", async () => {
    const { api, store } = setup([acct("a"), acct("b", "#16a34a")]);
    store.getState().setLists("a", [tl("a", "L1", "Inbox")]);
    store.getState().setLists("b", [tl("b", "M1", "Other")]);
    store.getState().applyListTasks(listKey("a", "L1"), [task("a", "L1", "t1")], true);
    const before = store.getState().tasks;

    await store.getState().moveTask(taskKey("a", "t1"), { listKey: listKey("b", "M1"), previousTaskId: null });
    expect(api.moveTask).not.toHaveBeenCalled();
    expect(store.getState().tasks).toBe(before);
    expect(store.getState().toasts.map((t) => t.text)).toEqual(["Can't move tasks between accounts"]);
  });

  it("writes_blocked_until_first_sync", async () => {
    const { api, store } = setup();
    store.getState().setLists("a", [tl("a", "L1", "Inbox")]);
    store.getState().applyListTasks(listKey("a", "L1"), [task("a", "L1", "t1")], true);
    store.setState({ writesEnabled: false });
    const before = store.getState().tasks;
    const k = taskKey("a", "t1");

    await store.getState().addTask(listKey("a", "L1"), "Milk");
    await store.getState().toggleComplete(k);
    await store.getState().updateTask(k, { title: "x" });
    await store.getState().deleteTask(k);
    await store.getState().moveTask(k, { listKey: listKey("a", "L1"), previousTaskId: null });

    expect(store.getState().tasks).toBe(before);
    for (const fn of [api.insertTask, api.patchTask, api.deleteTask, api.moveTask]) expect(fn).not.toHaveBeenCalled();
    expect(store.getState().toasts.map((t) => t.text)).toEqual(Array(5).fill("Still syncing — try again in a moment"));
  });
  it("setLists_and_applyListTasks_for_unknown_account_are_ignored", () => {
    const { store } = setup([acct("a")]);
    store.getState().setLists("ghost", [tl("ghost", "G1", "Ghost")]);
    store.getState().applyListTasks(listKey("ghost", "G1"), [task("ghost", "G1", "g1")], true);
    const s = store.getState();
    expect(s.lists).toEqual({});
    expect(s.tasks).toEqual({});
    expect(s.layout.rows.flatMap((r) => r.slots)).toEqual([]);
  });

  it("markReauth_toasts_once_on_transition", () => {
    const { store } = setup([acct("a")]);
    store.getState().markReauth("a");
    store.getState().markReauth("a");
    expect(store.getState().toasts.map((t) => t.text)).toEqual([
      "Google sign-in expired for a@x.com — open Settings to sign in again",
    ]);
  });

  it("moveTask_cross_list_parent_takes_its_children", async () => {
    const { api, store } = setup();
    store.getState().setLists("a", [tl("a", "L1", "Inbox"), tl("a", "L2", "Work")]);
    store.getState().applyListTasks(
      listKey("a", "L1"),
      [
        task("a", "L1", "p"),
        task("a", "L1", "c1", { parent: "p", position: "00000000000000000001" }),
        task("a", "L1", "c2", { parent: "p", position: "00000000000000000002", status: "completed" }),
        task("a", "L1", "other"),
      ],
      true,
    );
    api.moveTask.mockImplementation(async (_a, _l, id, opts) =>
      task("a", opts.destinationTasklist ?? "L1", id, opts.parent ? { parent: opts.parent } : {}),
    );

    await store.getState().moveTask(taskKey("a", "p"), { listKey: listKey("a", "L2"), previousTaskId: null });
    expect(api.moveTask.mock.calls.map((c) => [c[2], c[3]])).toEqual([
      ["p", { destinationTasklist: "L2" }],
      ["c1", { destinationTasklist: "L2", parent: "p" }],
      ["c2", { destinationTasklist: "L2", parent: "p", previous: "c1" }],
    ]);
    const t = store.getState().tasks;
    expect([t[taskKey("a", "c1")].listId, t[taskKey("a", "c2")].listId, t[taskKey("a", "other")].listId]).toEqual(["L2", "L2", "L1"]);
    expect(t[taskKey("a", "c1")].parent).toBe("p");
  });

  it("moveTask_child_404_is_treated_as_already_moved", async () => {
    const { api, store } = setup();
    store.getState().setLists("a", [tl("a", "L1", "Inbox"), tl("a", "L2", "Work")]);
    store.getState().applyListTasks(listKey("a", "L1"), [task("a", "L1", "p"), task("a", "L1", "c1", { parent: "p" })], true);
    api.moveTask.mockImplementation(async (_a, _l, id, opts) => {
      if (id === "c1") throw new ApiError(404, "notFound", "Not Found");
      return task("a", opts.destinationTasklist ?? "L1", id);
    });

    await store.getState().moveTask(taskKey("a", "p"), { listKey: listKey("a", "L2"), previousTaskId: null });
    expect(api.moveTask).toHaveBeenCalledTimes(2);
    expect(store.getState().toasts).toEqual([]);
    expect(store.getState().tasks[taskKey("a", "c1")]).toMatchObject({ listId: "L2", parent: "p" });
    expect(store.getState().tasks[taskKey("a", "p")].listId).toBe("L2");
  });

  describe("transferTask", () => {
    function twoAccounts() {
      const ctx = setup([acct("a"), acct("b", "#16a34a")]);
      const { store, api } = ctx;
      store.getState().setLists("a", [tl("a", "L1", "Inbox")]);
      store.getState().setLists("b", [tl("b", "M1", "Shared")]);
      store.getState().applyListTasks(
        listKey("a", "L1"),
        [
          task("a", "L1", "p", { title: "งานส่งลูกค้า", notes: "n", due: "2026-12-01T00:00:00.000Z", position: "00000000000000000005" }),
          task("a", "L1", "c1", { parent: "p", position: "00000000000000000001" }),
          task("a", "L1", "c2", { parent: "p", position: "00000000000000000002", status: "completed", completed: "2026-11-20T00:00:00.000Z" }),
        ],
        true,
      );
      store.getState().applyListTasks(listKey("b", "M1"), [task("b", "M1", "X", { position: "00000000000000000003" })], true);
      api.listTasks.mockImplementation(async () => Object.values(store.getState().tasks).filter((t) => t.listId === "L1"));
      let n = 0;
      api.insertTask.mockImplementation(async (acc: string, list: string, body: Partial<Task>, opts: { parent?: string }) =>
        task(acc, list, `new${++n}`, { ...body, parent: opts.parent }),
      );
      return ctx;
    }
    const srcKeys = [taskKey("a", "p"), taskKey("a", "c1"), taskKey("a", "c2")];

    it("copies_parent_then_children_then_deletes_the_source", async () => {
      const { api, store } = twoAccounts();
      let release!: () => void;
      api.deleteTask.mockReturnValue(new Promise<void>((r) => (release = r)));
      let openGate!: () => void;
      const gate = new Promise<void>((r) => (openGate = r));
      const insert = api.insertTask.getMockImplementation()!;
      api.insertTask.mockImplementation(async (...args: Parameters<typeof insert>) => {
        await gate;
        return insert(...args);
      });

      const p = store.getState().transferTask(taskKey("a", "p"), { listKey: listKey("b", "M1"), previousTaskId: "X" });
      // optimistic (after the source-list read): source gone, pending copies in the target right after X
      await vi.waitFor(() => expect(store.getState().tasks[taskKey("a", "p")]).toBeUndefined());
      const mid = store.getState().tasks;
      for (const k of srcKeys) expect(mid[k]).toBeUndefined();
      const pending = Object.values(mid).filter((t) => t.id.startsWith("tmp:"));
      expect(pending).toHaveLength(3);
      const tmpParent = pending.find((t) => !t.parent?.startsWith("tmp:"))!;
      expect(tmpParent).toMatchObject({ accountId: "b", listId: "M1", title: "งานส่งลูกค้า" });
      expect(tmpParent.position > mid[taskKey("b", "X")].position).toBe(true);
      expect(pending.filter((t) => t.parent === tmpParent.id)).toHaveLength(2);
      openGate();

      await vi.waitFor(() => expect(api.deleteTask).toHaveBeenCalled());
      expect(Object.keys(store.getState().tasks).some((k) => k.includes("tmp:"))).toBe(false);
      release();
      await p;

      expect(api.insertTask.mock.calls).toEqual([
        ["b", "M1", { title: "งานส่งลูกค้า", notes: "n", due: "2026-12-01T00:00:00.000Z", status: "needsAction" }, { previous: "X" }],
        ["b", "M1", { title: "c1", status: "needsAction" }, { parent: "new1" }],
        ["b", "M1", { title: "c2", status: "completed", completed: "2026-11-20T00:00:00.000Z" }, { parent: "new1", previous: "new2" }],
      ]);
      expect(api.deleteTask).toHaveBeenCalledTimes(1);
      expect(api.deleteTask).toHaveBeenCalledWith("a", "L1", "p");
      const t = store.getState().tasks;
      for (const k of srcKeys) expect(t[k]).toBeUndefined();
      expect(Object.keys(t).some((k) => k.includes("tmp:"))).toBe(false);
      expect(t[taskKey("b", "new1")]).toMatchObject({ listId: "M1", title: "งานส่งลูกค้า" });
      expect(t[taskKey("b", "new2")]).toMatchObject({ parent: "new1" });
      expect(t[taskKey("b", "new3")]).toMatchObject({ parent: "new1", status: "completed" });
      expect(store.getState().toasts).toEqual([]);
    });

    it("insert_failure_deletes_copies_made_and_restores_the_source", async () => {
      const { api, store } = twoAccounts();
      const before = store.getState().tasks;
      let n = 0;
      api.insertTask.mockImplementation(async (acc: string, list: string, body: Partial<Task>) => {
        if (++n === 3) throw new ApiError(500, "backendError", "Boom");
        return task(acc, list, `new${n}`, body);
      });

      await store.getState().transferTask(taskKey("a", "p"), { listKey: listKey("b", "M1"), previousTaskId: null });
      expect(api.deleteTask.mock.calls.map((c) => c.slice(0, 3)).sort()).toEqual([
        ["b", "M1", "new1"],
        ["b", "M1", "new2"],
      ]);
      expect(api.deleteTask).not.toHaveBeenCalledWith("a", "L1", "p");
      const t = store.getState().tasks;
      for (const k of srcKeys) expect(t[k]).toEqual(before[k]);
      expect(Object.keys(t).some((k) => k.includes("tmp:"))).toBe(false);
      expect(Object.keys(t).sort()).toEqual(Object.keys(before).sort());
      expect(store.getState().toasts.map((x) => x.text)).toEqual(["Couldn't move to Shared — Boom"]);
    });

    it("cleanup_delete_errors_are_ignored", async () => {
      const { api, store } = twoAccounts();
      api.insertTask.mockRejectedValueOnce(new Error("first")); // parent insert fails: nothing to clean up
      await store.getState().transferTask(taskKey("a", "p"), { listKey: listKey("b", "M1"), previousTaskId: null });
      expect(api.deleteTask).not.toHaveBeenCalled();
      expect(store.getState().toasts.map((x) => x.text)).toEqual(["Couldn't move to Shared — first"]);

      let n = 0;
      api.insertTask.mockImplementation(async (acc: string, list: string, body: Partial<Task>) => {
        if (++n === 2) throw new Error("second");
        return task(acc, list, `z${n}`, body);
      });
      api.deleteTask.mockRejectedValue(new Error("cleanup failed"));
      await store.getState().transferTask(taskKey("a", "p"), { listKey: listKey("b", "M1"), previousTaskId: null });
      expect(api.deleteTask).toHaveBeenCalledWith("b", "M1", "z1");
      expect(store.getState().tasks[taskKey("a", "p")]).toBeDefined();
      expect(store.getState().toasts.map((x) => x.text)).toEqual(["Couldn't move to Shared — first", "Couldn't move to Shared — second"]);
    });

    it("source_delete_failure_keeps_copies_and_restores_source", async () => {
      const { api, store } = twoAccounts();
      const before = store.getState().tasks;
      api.deleteTask.mockRejectedValue(new ApiError(500, "backendError", "Nope"));

      await store.getState().transferTask(taskKey("a", "p"), { listKey: listKey("b", "M1"), previousTaskId: null });
      const t = store.getState().tasks;
      for (const k of srcKeys) expect(t[k]).toEqual(before[k]);
      for (const id of ["new1", "new2", "new3"]) expect(t[taskKey("b", id)]).toBeDefined();
      expect(Object.keys(t).some((k) => k.includes("tmp:"))).toBe(false);
      expect(store.getState().toasts.map((x) => x.text)).toEqual([
        "Copied to b@x.com, but the original couldn't be removed — delete it manually",
      ]);
    });

    it("old_completed_subtasks_missing_locally_are_fetched_and_copied", async () => {
      const { api, store } = twoAccounts();
      const old = task("a", "L1", "c0", {
        parent: "p",
        position: "00000000000000000000",
        status: "completed",
        completed: "2025-01-01T00:00:00.000Z",
      });
      const local = Object.values(store.getState().tasks).filter((t) => t.listId === "L1");
      // remote has the old child; it lacks local c1 (just created locally) — the union keeps both
      api.listTasks.mockResolvedValue([...local.filter((t) => t.id !== "c1"), old, task("a", "L1", "z", { parent: "other" })]);

      await store.getState().transferTask(taskKey("a", "p"), { listKey: listKey("b", "M1"), previousTaskId: null });
      expect(api.listTasks).toHaveBeenCalledWith("a", "L1", { showCompleted: true });
      expect(api.insertTask.mock.calls.map((c) => [c[2].title, c[3]])).toEqual([
        ["งานส่งลูกค้า", {}],
        ["c0", { parent: "new1" }],
        ["c1", { parent: "new1", previous: "new2" }],
        ["c2", { parent: "new1", previous: "new3" }],
      ]);
      expect(api.insertTask.mock.calls[1][2]).toEqual({ title: "c0", status: "completed", completed: "2025-01-01T00:00:00.000Z" });
      expect(store.getState().tasks[taskKey("b", "new2")]).toMatchObject({ title: "c0", parent: "new1", status: "completed" });
      expect(store.getState().tasks[taskKey("a", "c0")]).toBeUndefined();
      expect(store.getState().toasts).toEqual([]);
    });

    it("a_failed_prefetch_refuses_the_transfer", async () => {
      const { api, store } = twoAccounts();
      const before = store.getState().tasks;
      api.listTasks.mockRejectedValue(new ApiError(503, "backendError", "Offline"));
      await store.getState().transferTask(taskKey("a", "p"), { listKey: listKey("b", "M1"), previousTaskId: null });
      expect(store.getState().tasks).toBe(before);
      expect(api.insertTask).not.toHaveBeenCalled();
      expect(api.deleteTask).not.toHaveBeenCalled();
      expect(store.getState().toasts.map((x) => x.text)).toEqual(["Couldn't move to Shared — Offline"]);
    });

    it("a_poll_that_re_adds_the_source_mid_transfer_is_cleaned_up", async () => {
      const { api, store } = twoAccounts();
      const sourceTasks = Object.values(store.getState().tasks).filter((t) => t.listId === "L1");
      for (const fail of [false, true]) {
        api.deleteTask.mockImplementationOnce(async () => {
          // full poll of the source list while the source still exists on Google
          store.getState().applyListTasks(listKey("a", "L1"), sourceTasks, true);
          if (fail) throw new ApiError(404, "notFound", "gone");
        });
        await store.getState().transferTask(taskKey("a", "p"), { listKey: listKey("b", "M1"), previousTaskId: null });
        const t = store.getState().tasks;
        for (const k of srcKeys) expect(t[k]).toBeUndefined();
        expect(store.getState().toasts).toEqual([]);
        // put the source back for the 404 round
        store.getState().applyListTasks(listKey("a", "L1"), sourceTasks, true);
      }
      expect(Object.values(store.getState().tasks).filter((t) => t.accountId === "b" && t.parent === undefined && t.id !== "X")).toHaveLength(2);
    });

    it("refused_while_writes_are_off", async () => {
      const { api, store } = twoAccounts();
      store.setState({ writesEnabled: false });
      const before = store.getState().tasks;
      await store.getState().transferTask(taskKey("a", "p"), { listKey: listKey("b", "M1"), previousTaskId: null });
      expect(store.getState().tasks).toBe(before);
      expect(api.insertTask).not.toHaveBeenCalled();
      expect(api.deleteTask).not.toHaveBeenCalled();
      // only the standard write gate message, no transfer toast
      expect(store.getState().toasts.map((x) => x.text)).toEqual(["Still syncing — try again in a moment"]);
    });

    it("a_task_with_subtasks_is_not_nested", async () => {
      const { api, store } = twoAccounts();
      await store.getState().transferTask(taskKey("a", "p"), { listKey: listKey("b", "M1"), previousTaskId: null, parentId: "X" });
      expect(api.insertTask).not.toHaveBeenCalled();
      expect(store.getState().toasts.map((x) => x.text)).toEqual(["Can't nest a task that has subtasks"]);
    });
  });
});
