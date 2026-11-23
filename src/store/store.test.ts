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

  it("setLists_merges_same_name_and_places_in_first_row", async () => {
    const { persist, store } = setup([acct("a"), acct("b", "#16a34a")]);
    store.getState().addRow();
    store.getState().setLists("a", [tl("a", "g1", "Groceries"), tl("a", "w", "Work")]);
    store.getState().setLists("b", [tl("b", "g2", " groceries ")]);

    const s = store.getState();
    const merged = s.groups.find((g) => g.key === mergedKey("Groceries"));
    expect(merged?.members).toEqual([listKey("a", "g1"), listKey("b", "g2")]);
    expect(s.groups.map((g) => g.key)).toEqual([mergedKey("Groceries"), listKey("a", "w")]);
    expect(s.layout.rows[0].slots).toEqual([listKey("a", "w"), mergedKey("Groceries")]);
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
});
