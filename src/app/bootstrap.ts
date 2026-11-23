import { getCurrentWindow } from "@tauri-apps/api/window";
import { TasksApi } from "../api/tasksApi";
import { createTauriPersistence } from "../layout/persistence";
import { getAccessToken } from "../lib/tauri";
import { createTaskStore, setAppStore, type TaskStore } from "../store/store";
import { SyncEngine } from "../sync/syncEngine";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import type { Settings } from "../types";
import { applySettings } from "./applySettings";


async function applyWindow(s: Settings) {
  try {
    await getCurrentWindow().setAlwaysOnTop(s.alwaysOnTop);
  } catch {
    /* not running inside Tauri */
  }
  try {
    if ((await isEnabled()) !== s.launchAtLogin) await (s.launchAtLogin ? enable() : disable());
  } catch {
    /* not running inside Tauri */
  }
}

/** Pure helper: only act when the minimized state actually changes. */
export function minimizeTransition(prev: boolean, now: boolean): "pause" | "resume" | null {
  if (!prev && now) return "pause";
  if (prev && !now) return "resume";
  return null;
}

export async function bootstrap(): Promise<{ store: TaskStore; engine: SyncEngine }> {
  const persist = createTauriPersistence();
  const api = new TasksApi({ getToken: getAccessToken });
  const store = createTaskStore({ api, persist });
  setAppStore(store);

  const [cache, layout, settings, accounts] = await Promise.all([
    persist.loadCache(),
    persist.loadLayout(),
    persist.loadSettings(),
    persist.loadAccounts(),
  ]);
  store.getState().hydrate(cache, layout, settings, accounts ?? []);

  const engine = new SyncEngine(store, api);
  if (store.getState().accounts.length > 0) void engine.start();

  window.addEventListener("focus", () => void engine.syncNow());
  try {
    const win = getCurrentWindow();
    let wasMinimized = false;
    win
      .onResized(async () => {
        try {
          const now = await win.isMinimized();
          const action = minimizeTransition(wasMinimized, now);
          wasMinimized = now;
          if (action === "pause") engine.pause();
          else if (action === "resume") engine.resume();
        } catch {
          /* ignore */
        }
      })
      .catch(() => {});
  } catch {
    /* not running inside Tauri */
  }

  let prev = store.getState().settings;
  applySettings(prev);
  void applyWindow(prev);
  store.subscribe((s) => {
    if (s.settings === prev) return;
    prev = s.settings;
    applySettings(prev);
    void applyWindow(prev);
  });

  return { store, engine };
}
