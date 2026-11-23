import { startSignIn } from "../lib/tauri";
import type { TaskStore } from "../store/store";
import type { SyncEngine } from "../sync/syncEngine";

/** Run the Google sign-in, record the account, and sync. Rejects with the Rust error string. */
export async function addAccountFlow(store: TaskStore, engine: SyncEngine): Promise<void> {
  const info = await startSignIn();
  const first = store.getState().accounts.length === 0;
  store.getState().addAccountFromSignIn(info);
  if (first) void engine.start();
  else void engine.syncNow();
}

export const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
