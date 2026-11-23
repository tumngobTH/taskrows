import { createContext, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type DroppableContainer,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { getAppStore, useTaskStore } from "../store/store";
import { comparePosition, tasksOfList } from "../sync/merge";
import { listKey as toListKey, parseListKey } from "../lib/ids";
import { canDropTask, slotTargetAccount, taskDropPlan, taskInsertIndex, type DragItem } from "./dragRules";
import type { ListKey, SlotKey, Task, TaskKey } from "../types";

/** Data attached to every draggable / droppable on the board. */
export type DndData =
  | { type: "slot"; slotKey: SlotKey; rowId: string }
  | { type: "task"; taskKey: TaskKey; listKey: ListKey; parentId: string | null }
  | { type: "row"; rowId: string }
  | { type: "member"; listKey: ListKey }
  | { type: "column"; slotKey: SlotKey };

/** The row a column is rendered in (provided by Row, read by ListColumn's sortable). */
export const RowIdContext = createContext<string | null>(null);

export const slotDndId = (k: SlotKey) => `slot|${k}`;
export const taskDndId = (k: TaskKey) => `task|${k}`;
export const rowDndId = (id: string) => `row|${id}`;
export const memberDndId = (k: ListKey) => `member|${k}`;
export const columnDndId = (k: SlotKey) => `column|${k}`;

const dataOf = (c: { data: { current?: unknown } }) => c.data.current as DndData | undefined;

const RANK: Record<DndData["type"], number> = { slot: 0, task: 0, member: 1, row: 1, column: 2 };

/**
 * Only droppables that make sense for the active item: columns go to rows / other columns;
 * tasks go to tasks / member lists / columns. A top-level task never targets a subtask slot
 * (that would nest it); a subtask sees every task so an out-of-parent drop is refused with a toast.
 */
export const boardCollision: CollisionDetection = (args) => {
  const active = args.active.data.current as DndData | undefined;
  if (!active) return [];
  const accepts = (d: DndData | undefined): boolean => {
    if (!d) return false;
    if (active.type === "slot") return d.type === "slot" || d.type === "row";
    if (active.type !== "task") return false;
    if (d.type === "task") return d.parentId === null || active.parentId !== null;
    return d.type === "member" || d.type === "column";
  };
  const candidates = args.droppableContainers.filter((c) => accepts(dataOf(c)));
  const items = (pred: (c: DroppableContainer) => boolean) => candidates.filter((c) => RANK[dataOf(c)!.type] === 0 && pred(c));
  const within = pointerWithin({ ...args, droppableContainers: candidates }).sort(
    (a, b) => RANK[dataOf(a.data!.droppableContainer)!.type] - RANK[dataOf(b.data!.droppableContainer)!.type],
  );
  const hit = within[0];
  if (hit) {
    const d = dataOf(hit.data!.droppableContainer)!;
    if (RANK[d.type] === 0) return [hit];
    // Pointer is inside a container but between items: snap to the nearest item in that container.
    const inside = items((c) => {
      const cd = dataOf(c)!;
      if (d.type === "row") return cd.type === "slot" && cd.rowId === d.rowId;
      if (d.type === "member") return cd.type === "task" && cd.listKey === d.listKey;
      return false;
    });
    if (inside.length > 0) return closestCenter({ ...args, droppableContainers: inside });
    return [hit];
  }
  // A pointer released over empty space snaps back; only the keyboard path (no pointer) uses distance.
  if (args.pointerCoordinates) return [];
  return closestCenter({ ...args, droppableContainers: items(() => true) });
};

function openSiblings(tasks: Record<TaskKey, Task>, lk: ListKey, parentId: string | null): Task[] {
  return tasksOfList(tasks, lk)
    .filter((t) => !t.deleted && t.status !== "completed" && !t.id.startsWith("tmp:") && (t.parent ?? null) === parentId)
    .sort(comparePosition);
}

function isBelow(e: DragEndEvent, axis: "x" | "y"): boolean {
  const r = e.active.rect.current.translated;
  const o = e.over?.rect;
  if (!r || !o) return false;
  return axis === "y" ? r.top + r.height / 2 > o.top + o.height / 2 : r.left + r.width / 2 > o.left + o.width / 2;
}

export function handleDragEnd(e: DragEndEvent): void {
  const active = e.active.data.current as DndData | undefined;
  const over = e.over?.data.current as DndData | undefined;
  if (!active || !over) return;
  const s = getAppStore().getState();

  if (active.type === "slot") {
    if (over.type === "slot") {
      if (over.slotKey === active.slotKey) return;
      const row = s.layout.rows.find((r) => r.id === over.rowId);
      if (!row) return;
      const overIdx = row.slots.indexOf(over.slotKey);
      const fromIdx = row.slots.indexOf(active.slotKey);
      // Same row: arrayMove semantics (moveSlot strips first, so overIdx is the final index).
      const toIndex = fromIdx >= 0 ? overIdx : overIdx + (isBelow(e, "x") ? 1 : 0);
      s.moveSlot(active.slotKey, row.id, toIndex);
    } else if (over.type === "row") {
      const row = s.layout.rows.find((r) => r.id === over.rowId);
      if (!row || row.slots.includes(active.slotKey)) return;
      s.moveSlot(active.slotKey, row.id, row.slots.length);
    }
    return;
  }

  if (active.type !== "task") return;
  const task = s.tasks[active.taskKey];
  if (!task || task.status === "completed") return;

  let target: { listKey: ListKey; parentId: string | null; overId: string | null };
  if (over.type === "task") {
    const o = s.tasks[over.taskKey];
    if (!o) return;
    target = { listKey: over.listKey, parentId: over.parentId, overId: o.id };
  } else if (over.type === "member") {
    target = { listKey: over.listKey, parentId: null, overId: null };
  } else if (over.type === "column") {
    const group = s.groups.find((g) => g.key === over.slotKey);
    if (!group) return;
    const acct = slotTargetAccount(group, s.layout);
    const lk = group.members.find((m) => parseListKey(m).accountId === acct);
    if (!lk) return;
    target = { listKey: lk, parentId: null, overId: null };
  } else return;

  const accountId = parseListKey(target.listKey).accountId;
  const check = canDropTask(task, { listKey: target.listKey, accountId, parentId: target.parentId });
  if (!check.ok) {
    s.toast(check.reason);
    return;
  }
  const siblings = openSiblings(s.tasks, target.listKey, target.parentId);
  const index = taskInsertIndex(siblings, task.id, target.overId, isBelow(e, "y"));
  const plan = taskDropPlan(task, target, siblings, index);

  const sameSpot =
    target.listKey === toListKey(task.accountId, task.listId) &&
    target.parentId === (task.parent ?? null) &&
    plan.previousTaskId === (siblings[siblings.findIndex((t) => t.id === task.id) - 1]?.id ?? null);
  if (sameSpot) return;
  void s.moveTask(active.taskKey, plan);
}

function Overlay({ item }: { item: DragItem }) {
  const title = useTaskStore((s) =>
    item.type === "slot" ? s.groups.find((g) => g.key === item.slotKey)?.title : s.tasks[item.taskKey]?.title,
  );
  if (item.type === "slot") {
    return (
      <div className="list-column drag-overlay">
        <header className="list-header">
          <span className="list-title">{title}</span>
        </header>
      </div>
    );
  }
  return <div className="task drag-overlay"><span className="title">{title}</span></div>;
}

export default function BoardDnd({ children }: { children: ReactNode }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [active, setActive] = useState<DragItem | null>(null);
  const onDragStart = (e: DragStartEvent) => {
    const d = e.active.data.current as DndData | undefined;
    if (d?.type === "slot") setActive({ type: "slot", slotKey: d.slotKey });
    else if (d?.type === "task") setActive({ type: "task", taskKey: d.taskKey });
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={boardCollision}
      onDragStart={onDragStart}
      onDragEnd={(e) => {
        setActive(null);
        handleDragEnd(e);
      }}
      onDragCancel={() => setActive(null)}
    >
      {children}
      <DragOverlay dropAnimation={null}>{active ? <Overlay item={active} /> : null}</DragOverlay>
    </DndContext>
  );
}
