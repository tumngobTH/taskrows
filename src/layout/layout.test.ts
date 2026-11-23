import type { Group, Layout, TaskList } from "../types";
import { listKey, mergedKey } from "../lib/ids";
import {
  addRow,
  emptyLayout,
  moveSlot,
  reconcileLayout,
  removeRow,
  resolveGroups,
  setNewTaskTarget,
  targetAccount,
} from "./layout";

const tl = (accountId: string, id: string, title: string): TaskList => ({
  accountId,
  id,
  title,
  updated: "2026-01-01T00:00:00Z",
});

const single = (key: string, accountIds = ["a"]): Group => ({
  key,
  title: key,
  members: [key],
  accountIds,
});

describe("layout", () => {
  it("groups_merge_same_name_across_accounts", () => {
    const groups = resolveGroups(
      [tl("a", "1", "Groceries"), tl("b", "2", " groceries "), tl("a", "3", "Work")],
      true,
    );
    expect(groups).toEqual([
      {
        key: mergedKey("Groceries"),
        title: "Groceries",
        members: [listKey("a", "1"), listKey("b", "2")],
        accountIds: ["a", "b"],
      },
      { key: listKey("a", "3"), title: "Work", members: [listKey("a", "3")], accountIds: ["a"] },
    ]);
  });

  it("groups_do_not_merge_within_one_account", () => {
    const groups = resolveGroups([tl("a", "1", "Todo"), tl("a", "2", "todo")], true);
    expect(groups.map((g) => g.key)).toEqual([listKey("a", "1"), listKey("a", "2")]);
    expect(groups.every((g) => g.members.length === 1)).toBe(true);
  });

  it("groups_off_when_setting_false", () => {
    const groups = resolveGroups([tl("a", "1", "Todo"), tl("b", "2", "Todo")], false);
    expect(groups.map((g) => g.key)).toEqual([listKey("a", "1"), listKey("b", "2")]);
  });

  it("reconcile_appends_new_to_first_row_and_drops_missing", () => {
    const layout: Layout = {
      rows: [
        { id: "r1", heightFraction: 0.5, slots: ["x", "gone"] },
        { id: "r2", heightFraction: 0.5, slots: ["y"] },
      ],
      newTaskTarget: { x: "a", gone: "a" },
    };
    const before = JSON.parse(JSON.stringify(layout));
    const next = reconcileLayout(layout, [single("x"), single("y"), single("z")]);
    expect(next.rows[0].slots).toEqual(["x", "z"]);
    expect(next.rows[1].slots).toEqual(["y"]);
    expect(next.newTaskTarget).toEqual({ x: "a" });
    expect(layout).toEqual(before);
    expect(reconcileLayout({ rows: [], newTaskTarget: {} }, [single("x")]).rows).toEqual([
      { id: "r1", heightFraction: 1, slots: ["x"] },
    ]);
  });

  it("addRow_renormalises_fractions", () => {
    const next = addRow(emptyLayout());
    expect(next.rows.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(next.rows.map((r) => r.heightFraction)).toEqual([0.5, 0.5]);
  });

  it("removeRow_moves_slots_up_and_refuses_last", () => {
    const layout: Layout = {
      rows: [
        { id: "r1", heightFraction: 0.5, slots: ["a"] },
        { id: "r2", heightFraction: 0.5, slots: ["b", "c"] },
      ],
      newTaskTarget: {},
    };
    const next = removeRow(layout, "r2");
    expect(next.rows).toEqual([{ id: "r1", heightFraction: 1, slots: ["a", "b", "c"] }]);
    expect(removeRow(next, "r1")).toBe(next);
    const first = removeRow(layout, "r1");
    expect(first.rows).toEqual([{ id: "r2", heightFraction: 1, slots: ["b", "c", "a"] }]);
  });

  it("moveSlot_between_rows_keeps_order", () => {
    const layout: Layout = {
      rows: [
        { id: "r1", heightFraction: 0.5, slots: ["a", "b", "c"] },
        { id: "r2", heightFraction: 0.5, slots: ["d", "e"] },
      ],
      newTaskTarget: {},
    };
    const next = moveSlot(layout, "b", "r2", 1);
    expect(next.rows[0].slots).toEqual(["a", "c"]);
    expect(next.rows[1].slots).toEqual(["d", "b", "e"]);
    expect(layout.rows[0].slots).toEqual(["a", "b", "c"]);
    expect(moveSlot(layout, "a", "r1", 2).rows[0].slots).toEqual(["b", "c", "a"]);
  });

  it("targetAccount_defaults_to_first_member", () => {
    const group: Group = { key: "g", title: "g", members: ["a:1", "b:2"], accountIds: ["a", "b"] };
    const layout = emptyLayout();
    expect(targetAccount(layout, group)).toBe("a");
    expect(targetAccount(setNewTaskTarget(layout, "g", "b"), group)).toBe("b");
    expect(targetAccount(setNewTaskTarget(layout, "g", "zzz"), group)).toBe("a");
  });
});
