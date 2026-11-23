import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { DragEndEvent } from "@dnd-kit/core";
import { handleDragEnd, type DndData } from "./BoardDnd";
import Board from "../components/Board";
import { createTaskStore, setAppStore } from "../store/store";
import { createMemoryPersistence } from "../layout/persistence";
import type { TasksApi } from "../api/tasksApi";
import type { Task } from "../types";

const mk = (accountId: string, listId: string, id: string, position: string, extra: Partial<Task> = {}): Task => ({
  accountId, listId, id, title: id, status: "needsAction", updated: "", position, ...extra,
});

function setup() {
  const moveTask = vi.fn(async (a: string, l: string, id: string) => mk(a, l, id, "0"));
  const api = { moveTask } as unknown as TasksApi;
  const store = createTaskStore({ api, persist: createMemoryPersistence() });
  setAppStore(store);
  const tasks = [
    mk("a1", "l1", "t1", "1"),
    mk("a1", "l1", "t2", "2"),
    mk("a1", "l1", "t3", "3"),
    mk("a1", "l1", "s1", "1", { parent: "t1" }),
    mk("a1", "l2", "u1", "1"),
    mk("a2", "l3", "v1", "1"),
  ];
  store.getState().hydrate(
    {
      lists: {
        "a1:l1": { accountId: "a1", id: "l1", title: "Work", updated: "" },
        "a1:l2": { accountId: "a1", id: "l2", title: "Home", updated: "" },
        "a2:l3": { accountId: "a2", id: "l3", title: "Other", updated: "" },
      },
      tasks: Object.fromEntries(tasks.map((t) => [`${t.accountId}:${t.id}`, t])),
    },
    null,
    null,
    [
      { id: "a1", email: "a@b.c", color: "#2563eb", needsReauth: false },
      { id: "a2", email: "d@e.f", color: "#16a34a", needsReauth: false },
    ],
  );
  store.setState({ writesEnabled: true });
  return { store, moveTask };
}

const ev = (active: DndData, over: DndData | null, below = false): DragEndEvent =>
  ({
    active: { id: "a", data: { current: active }, rect: { current: { translated: { top: below ? 20 : 0, left: 0, width: 10, height: 10 } } } },
    over: over && { id: "o", data: { current: over }, rect: { top: 0, left: 0, width: 10, height: 20 } },
  }) as unknown as DragEndEvent;

const task = (taskKey: string, listKey: string, parentId: string | null = null): DndData => ({ type: "task", taskKey, listKey, parentId });

describe("BoardDnd drop handling", () => {
  it("reorders a task within its list with previous = the sibling before the drop index", async () => {
    const { moveTask } = setup();
    handleDragEnd(ev(task("a1:t1", "a1:l1"), task("a1:t3", "a1:l1")));
    await vi.waitFor(() => expect(moveTask).toHaveBeenCalledWith("a1", "l1", "t1", { previous: "t3" }));
  });

  it("moves a task to another list of the same account", async () => {
    const { moveTask } = setup();
    handleDragEnd(ev(task("a1:t2", "a1:l1"), task("a1:u1", "a1:l2"), true));
    await vi.waitFor(() =>
      expect(moveTask).toHaveBeenCalledWith("a1", "l1", "t2", { previous: "u1", destinationTasklist: "l2" }),
    );
  });

  it("refuses a cross-account drop with a toast and no store write", () => {
    const { store, moveTask } = setup();
    handleDragEnd(ev(task("a1:t2", "a1:l1"), task("a2:v1", "a2:l3")));
    expect(moveTask).not.toHaveBeenCalled();
    expect(store.getState().toasts.map((t) => t.text)).toEqual(["Can't move tasks between accounts"]);
    expect(store.getState().tasks["a1:t2"].listId).toBe("l1");
  });

  it("refuses moving a subtask out of its parent", () => {
    const { store, moveTask } = setup();
    handleDragEnd(ev(task("a1:s1", "a1:l1", "t1"), task("a1:t2", "a1:l1")));
    expect(moveTask).not.toHaveBeenCalled();
    expect(store.getState().toasts.map((t) => t.text)).toEqual(["Can't move a subtask out of its parent"]);
  });

  it("does nothing when a task is dropped back on its own place", () => {
    const { store, moveTask } = setup();
    handleDragEnd(ev(task("a1:t2", "a1:l1"), task("a1:t2", "a1:l1")));
    expect(moveTask).not.toHaveBeenCalled();
    expect(store.getState().toasts).toEqual([]);
  });

  it("moves a column into an empty second row", () => {
    const { store } = setup();
    store.getState().addRow();
    const [r1, r2] = store.getState().layout.rows;
    const slot = r1.slots[0];
    handleDragEnd(ev({ type: "slot", slotKey: slot, rowId: r1.id }, { type: "row", rowId: r2.id }));
    const rows = store.getState().layout.rows;
    expect(rows[0].slots).not.toContain(slot);
    expect(rows[1].slots).toEqual([slot]);
  });

  it("reorders columns within a row", () => {
    const { store } = setup();
    const [a, b, c] = store.getState().layout.rows[0].slots;
    const rowId = store.getState().layout.rows[0].id;
    handleDragEnd(ev({ type: "slot", slotKey: a, rowId }, { type: "slot", slotKey: c, rowId }));
    expect(store.getState().layout.rows[0].slots).toEqual([b, c, a]);
  });
});

describe("Board", () => {
  it("renders columns under the DnD context and a resize handle between rows that commits on release", () => {
    const { store } = setup();
    store.getState().addRow();
    render(<Board />);
    expect(screen.getByText("Work")).toBeInTheDocument();
    const handle = screen.getByRole("separator", { name: "Resize rows" });
    const rowsEl = handle.parentElement!;
    rowsEl.getBoundingClientRect = () => ({ height: 1000 }) as DOMRect;
    handle.setPointerCapture = () => {};
    handle.hasPointerCapture = () => false;
    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 500 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 600 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 600 });
    const [f1, f2] = store.getState().layout.rows.map((r) => r.heightFraction);
    expect(f1).toBeCloseTo(0.6);
    expect(f2).toBeCloseTo(0.4);
  });
});
