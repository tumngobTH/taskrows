import { describe, it, expect } from "vitest";
import { canDropTask, slotTargetAccount, taskDropPlan, taskInsertIndex } from "./dragRules";
import type { Group, Layout, Task } from "../types";

const mk = (id: string, position: string, extra: Partial<Task> = {}): Task => ({
  accountId: "a1", listId: "l1", id, title: id, status: "needsAction", updated: "", position, ...extra,
});

describe("dragRules", () => {
  it("subtask_can_reorder_among_siblings_only", () => {
    const sub = mk("s1", "1", { parent: "p1" });
    expect(canDropTask(sub, { listKey: "a1:l1", accountId: "a1", parentId: "p1" })).toEqual({ ok: true });
    const reason = "Can't move a subtask out of its parent";
    expect(canDropTask(sub, { listKey: "a1:l1", accountId: "a1", parentId: null })).toEqual({ ok: false, reason });
    expect(canDropTask(sub, { listKey: "a1:l1", accountId: "a1", parentId: "p2" })).toEqual({ ok: false, reason });
    expect(canDropTask(sub, { listKey: "a1:l2", accountId: "a1", parentId: "p1" })).toEqual({ ok: false, reason });
    // a top-level task may move to another list of the same account
    expect(canDropTask(mk("t1", "1"), { listKey: "a1:l2", accountId: "a1", parentId: null })).toEqual({ ok: true });
  });

  it("cross_account_drop_is_allowed_but_a_subtask_still_stays_in_its_parent", () => {
    expect(canDropTask(mk("t1", "1"), { listKey: "a2:l9", accountId: "a2", parentId: null })).toEqual({ ok: true });
    expect(canDropTask(mk("t1", "1"), { listKey: "a2:l9", accountId: "a2", parentId: null }, { hasChildren: true })).toEqual({ ok: true });
    expect(canDropTask(mk("s1", "1", { parent: "p1" }), { listKey: "a2:l9", accountId: "a2", parentId: null })).toEqual({
      ok: false,
      reason: "Can't move a subtask out of its parent",
    });
  });

  it("a_task_with_subtasks_cannot_be_nested", () => {
    const reason = "Can't nest a task that has subtasks";
    expect(canDropTask(mk("t1", "1"), { listKey: "a1:l1", accountId: "a1", parentId: "p9" }, { hasChildren: true })).toEqual({ ok: false, reason });
    expect(canDropTask(mk("t1", "1"), { listKey: "a2:l9", accountId: "a2", parentId: "p9" }, { hasChildren: true })).toEqual({ ok: false, reason });
    expect(canDropTask(mk("t1", "1"), { listKey: "a2:l9", accountId: "a2", parentId: "p9" })).toEqual({ ok: true });
  });

  it("plan_sets_previous_id_from_index", () => {
    const t = mk("t2", "2");
    const sibs = [mk("t1", "1"), t, mk("t3", "3"), mk("t4", "4")];
    const target = { listKey: "a1:l1", parentId: null };
    expect(taskDropPlan(t, target, sibs, 0)).toEqual({ listKey: "a1:l1", previousTaskId: null, parentId: null });
    // after removing t2: [t1, t3, t4]; index 2 → previous is t3
    expect(taskDropPlan(t, target, sibs, 2).previousTaskId).toBe("t3");
    expect(taskDropPlan(t, target, sibs, 3).previousTaskId).toBe("t4");
    const sub = mk("s2", "2", { parent: "p1" });
    expect(taskDropPlan(sub, { listKey: "a1:l1", parentId: "p1" }, [mk("s1", "1", { parent: "p1" }), sub], 1)).toEqual({
      listKey: "a1:l1",
      previousTaskId: "s1",
      parentId: "p1",
    });
  });

  it("drop_on_merged_group_uses_target_account", () => {
    const group: Group = { key: "merged:work", title: "Work", members: ["a1:l1", "a2:l2"], accountIds: ["a1", "a2"] };
    const layout: Layout = { rows: [], newTaskTarget: {} };
    expect(slotTargetAccount(group, layout)).toBe("a1");
    expect(slotTargetAccount(group, { ...layout, newTaskTarget: { "merged:work": "a2" } })).toBe("a2");
  });

  it("insert index follows arrayMove within a list and pointer side across lists", () => {
    const sibs = [mk("t1", "1"), mk("t2", "2"), mk("t3", "3")];
    expect(taskInsertIndex(sibs, "t1", "t3", false)).toBe(2); // moving down lands after the over item
    expect(taskInsertIndex(sibs, "t3", "t1", true)).toBe(0); // moving up lands before the over item
    expect(taskInsertIndex(sibs, "t2", "t2", false)).toBe(1); // over itself = no move
    expect(taskInsertIndex(sibs, "x9", "t2", false)).toBe(1); // from another list, upper half
    expect(taskInsertIndex(sibs, "x9", "t2", true)).toBe(2); // from another list, lower half
    expect(taskInsertIndex(sibs, "x9", null, true)).toBe(0); // empty body / add input → top
  });
});
