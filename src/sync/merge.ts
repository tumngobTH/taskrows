import type { ListKey, Task, TaskKey } from "../types";
import { parseListKey, taskKey } from "../lib/ids";

export type TreeNode = { task: Task; children: Task[] };

export function upsertTasks(
  tasks: Record<TaskKey, Task>,
  incoming: Task[],
): Record<TaskKey, Task> {
  const next = { ...tasks };
  for (const t of incoming) {
    const k = taskKey(t.accountId, t.id);
    if (t.deleted === true) {
      // A tombstone from the old list after a cross-list move must not delete the task in its new list.
      if (next[k]?.listId === t.listId) delete next[k];
    } else next[k] = t;
  }
  return next;
}

export function replaceListTasks(
  tasks: Record<TaskKey, Task>,
  key: ListKey,
  fresh: Task[],
): Record<TaskKey, Task> {
  const { accountId, listId } = parseListKey(key);
  const kept: Record<TaskKey, Task> = {};
  for (const [k, t] of Object.entries(tasks)) {
    if (!(t.accountId === accountId && t.listId === listId)) kept[k] = t;
  }
  return upsertTasks(kept, fresh);
}

export function tasksOfList(tasks: Record<TaskKey, Task>, key: ListKey): Task[] {
  const { accountId, listId } = parseListKey(key);
  return Object.values(tasks).filter(
    (t) => t.accountId === accountId && t.listId === listId,
  );
}

export function comparePosition(a: Task, b: Task): number {
  if (a.position < b.position) return -1;
  if (a.position > b.position) return 1;
  return 0;
}

export function splitCompleted(list: Task[]): { open: Task[]; done: Task[] } {
  const open: Task[] = [];
  const done: Task[] = [];
  for (const t of list) (t.status === "completed" ? done : open).push(t);
  return { open, done };
}

export function buildTree(open: Task[]): TreeNode[] {
  const ids = new Set(open.map((t) => t.id));
  const top = open.filter((t) => !t.parent || !ids.has(t.parent));
  return [...top].sort(comparePosition).map((task) => ({
    task,
    children: open.filter((t) => t.parent === task.id).sort(comparePosition),
  }));
}

export function childrenOf(tasks: Record<TaskKey, Task>, parent: Task): Task[] {
  return Object.values(tasks)
    .filter(
      (t) =>
        t.accountId === parent.accountId &&
        t.listId === parent.listId &&
        t.parent === parent.id,
    )
    .sort(comparePosition);
}
