import type { AccountId, ListKey, SlotKey, TaskKey } from "../types";

export function listKey(accountId: AccountId, listId: string): ListKey {
  return `${accountId}:${listId}`;
}

export function parseListKey(k: ListKey): { accountId: AccountId; listId: string } {
  const i = k.indexOf(":");
  return { accountId: k.slice(0, i), listId: k.slice(i + 1) };
}

export function taskKey(accountId: AccountId, taskId: string): TaskKey {
  return `${accountId}:${taskId}`;
}

export function normaliseName(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function mergedKey(title: string): SlotKey {
  return "merged:" + normaliseName(title);
}

export function isMergedKey(k: SlotKey): boolean {
  return k.startsWith("merged:");
}
