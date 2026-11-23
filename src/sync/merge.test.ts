import { describe, it, expect } from "vitest";
import type { Task } from "../types";
import { listKey, taskKey } from "../lib/ids";
import {
  upsertTasks,
  replaceListTasks,
  buildTree,
  comparePosition,
} from "./merge";

function mk(over: Partial<Task> & { id: string }): Task {
  return {
    accountId: "a1",
    listId: "L1",
    title: over.id,
    status: "needsAction",
    updated: "2026-01-01T00:00:00Z",
    position: "00000000000000000001",
    ...over,
  };
}

describe("merge", () => {
  it("upsert_removes_deleted", () => {
    const t = mk({ id: "t1" });
    const base = upsertTasks({}, [t]);
    expect(base[taskKey("a1", "t1")]).toBeDefined();
    const next = upsertTasks(base, [{ ...t, deleted: true }]);
    expect(next[taskKey("a1", "t1")]).toBeUndefined();
    expect(base[taskKey("a1", "t1")]).toBeDefined();
  });

  it("upsert_tombstone_from_old_list_does_not_delete_moved_task", () => {
    const base = upsertTasks({}, [mk({ id: "t1", listId: "L2" })]);
    const next = upsertTasks(base, [mk({ id: "t1", listId: "L1", deleted: true })]);
    expect(next[taskKey("a1", "t1")]?.listId).toBe("L2");
  });

  it("upsert_moves_task_to_new_list", () => {
    const base = upsertTasks({}, [mk({ id: "t1", listId: "L1" })]);
    const next = upsertTasks(base, [mk({ id: "t1", listId: "L2" })]);
    expect(Object.keys(next)).toHaveLength(1);
    expect(next[taskKey("a1", "t1")].listId).toBe("L2");
  });

  it("replaceListTasks_drops_stale", () => {
    const base = upsertTasks({}, [
      mk({ id: "old", listId: "L1" }),
      mk({ id: "keep", listId: "L2" }),
      mk({ id: "other", accountId: "a2", listId: "L1" }),
    ]);
    const next = replaceListTasks(base, listKey("a1", "L1"), [
      mk({ id: "fresh", listId: "L1" }),
    ]);
    expect(Object.keys(next).sort()).toEqual(
      [taskKey("a1", "fresh"), taskKey("a1", "keep"), taskKey("a2", "other")].sort(),
    );
  });

  it("buildTree_nests_children_and_orphans_top_level", () => {
    const open = [
      mk({ id: "c2", parent: "p", position: "00000000000000000002" }),
      mk({ id: "p", position: "00000000000000000005" }),
      mk({ id: "c1", parent: "p", position: "00000000000000000001" }),
      mk({ id: "orphan", parent: "gone", position: "00000000000000000003" }),
    ];
    const tree = buildTree(open);
    expect(tree.map((n) => n.task.id)).toEqual(["orphan", "p"]);
    expect(tree[0].children).toEqual([]);
    expect(tree[1].children.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("comparePosition_sorts_by_position_string", () => {
    const a = mk({ id: "a", position: "00000000000000000002" });
    const b = mk({ id: "b", position: "00000000000000000010" });
    expect(comparePosition(a, b)).toBe(-1);
    expect(comparePosition(b, a)).toBe(1);
    expect(comparePosition(a, { ...b, position: a.position })).toBe(0);
  });
});
