import { targetAccount } from "../layout/layout";
import { listKey } from "../lib/ids";
import type { AccountId, Group, Layout, ListKey, SlotKey, Task, TaskKey } from "../types";

export type DragItem = { type: "slot"; slotKey: SlotKey } | { type: "task"; taskKey: TaskKey };

export type DropCheck = { ok: true } | { ok: false; reason: string };

export function canDropTask(
  task: Task,
  target: { listKey: ListKey; accountId: AccountId; parentId: string | null },
): DropCheck {
  if (task.parent && (target.listKey !== listKey(task.accountId, task.listId) || target.parentId !== task.parent)) {
    return { ok: false, reason: "Can't move a subtask out of its parent" };
  }
  if (target.accountId !== task.accountId) return { ok: false, reason: "Can't move tasks between accounts" };
  return { ok: true };
}

/** Where `task` lands when inserted at `index` among `siblingsInOrder` (the dragged task itself is ignored). */
export function taskDropPlan(
  task: Task,
  target: { listKey: ListKey; parentId: string | null },
  siblingsInOrder: Task[],
  index: number,
): { listKey: ListKey; previousTaskId: string | null; parentId: string | null } {
  const rest = siblingsInOrder.filter((t) => t.id !== task.id);
  const i = Math.max(0, Math.min(index, rest.length));
  return { listKey: target.listKey, previousTaskId: i > 0 ? rest[i - 1].id : null, parentId: target.parentId };
}

/** A task dropped on a (merged) column goes to the member list of this account. */
export function slotTargetAccount(group: Group, layout: Layout): AccountId {
  return targetAccount(layout, group);
}

/**
 * Final index (among the siblings without the dragged task) for a drop over `overId`.
 * Same list: dnd-kit's arrayMove semantics (moving down lands after the over item, up lands before).
 * From elsewhere: before the over item, or after it when the pointer is in its lower half.
 * `overId === null` (empty list body / add input) means the top.
 */
export function taskInsertIndex(siblingsInOrder: Task[], draggedId: string, overId: string | null, below: boolean): number {
  const rest = siblingsInOrder.filter((t) => t.id !== draggedId);
  const from = siblingsInOrder.findIndex((t) => t.id === draggedId);
  if (overId === null) return 0;
  if (overId === draggedId) return from < 0 ? 0 : from;
  const j = rest.findIndex((t) => t.id === overId);
  if (j < 0) return 0;
  if (from >= 0) return from < siblingsInOrder.findIndex((t) => t.id === overId) ? j + 1 : j;
  return below ? j + 1 : j;
}
