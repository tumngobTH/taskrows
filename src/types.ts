export type AccountId = string; // Google `sub`
export interface Account {
  id: AccountId;
  email: string;
  color: string;
  needsReauth: boolean;
}
export interface TaskList {
  accountId: AccountId;
  id: string;
  title: string;
  updated: string;
}
export interface Task {
  accountId: AccountId;
  listId: string;
  id: string;
  title: string;
  notes?: string;
  status: "needsAction" | "completed";
  due?: string;
  completed?: string;
  updated: string;
  position: string;
  parent?: string;
  deleted?: boolean;
  hidden?: boolean;
}
export type ListKey = string; // `${accountId}:${listId}`
export type TaskKey = string; // `${accountId}:${taskId}`
export type SlotKey = string; // ListKey | `merged:${normalisedName}`
export interface Row {
  id: string;
  heightFraction: number;
  slots: SlotKey[];
}
export interface Layout {
  rows: Row[];
  newTaskTarget: Record<SlotKey, AccountId>;
}
export interface Group {
  key: SlotKey;
  title: string;
  members: ListKey[];
  accountIds: AccountId[];
}
export interface Settings {
  listWidth: number;
  pollIntervalSec: number;
  showCompleted: boolean;
  fontSize: "S" | "M" | "L";
  alwaysOnTop: boolean;
  launchAtLogin: boolean;
  theme: "system" | "light" | "dark";
  mergeSameName: boolean;
}
export const DEFAULT_SETTINGS: Settings = {
  listWidth: 320,
  pollIntervalSec: 60,
  showCompleted: false,
  fontSize: "M",
  alwaysOnTop: false,
  launchAtLogin: false,
  theme: "system",
  mergeSameName: true,
};
export interface SyncStatus {
  phase: "idle" | "syncing" | "offline" | "error";
  lastSyncAt?: number;
  message?: string;
  backoffMs: number;
}
