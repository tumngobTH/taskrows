import type { StoreApi } from "zustand/vanilla";
import type { Account, AccountId, ListKey, Task } from "../types";
import { ApiError, type TasksApi } from "../api/tasksApi";
import { listKey, parseListKey } from "../lib/ids";
import type { Actions, State } from "../store/store";

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(h: unknown): void;
}

export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

const DAY_MS = 86_400_000;
const OVERLAP_MS = 5 * 60_000;
const FULL_EVERY = 10;
const MAX_BACKOFF_MS = 600_000;
const RATE_REASONS = ["rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded"];

type Failure = "offline" | "rate" | "reauth" | "other";

function classify(e: unknown): Failure {
  if (e instanceof TypeError) return "offline";
  // Rust's token refresh reports a connect/timeout failure as the exact string "offline".
  if ((e instanceof Error ? e.message : e) === "offline") return "offline";
  if (e instanceof ApiError) {
    if (e.status === 401) return "reauth";
    if (e.status === 429 || (e.status === 403 && RATE_REASONS.includes(e.reason))) return "rate";
    return "other";
  }
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes("reauth_required") ? "reauth" : "other";
}

export interface SyncEngineOptions {
  /** Skip lists whose `tasklist.updated` is unchanged. Off until verified against the live API. */
  skipUnchangedLists?: boolean;
}

export class SyncEngine {
  private cycle = 0;
  private lastSync: Record<AccountId, number> = {};
  private seenUpdated: Record<ListKey, string> = {};
  private paused = false;
  private stopped = true;
  private timer: unknown = null;
  private inFlight: Promise<void> | null = null;
  private skipUnchangedLists: boolean;

  constructor(
    private store: StoreApi<State & Actions>,
    private api: TasksApi,
    private clock: Clock = realClock,
    opts: SyncEngineOptions = {},
  ) {
    this.skipUnchangedLists = opts.skipUnchangedLists ?? false;
    // An account that disappears (removed) must start from a full fetch if it comes back.
    store.subscribe((s, prev) => {
      if (s.accounts === prev.accounts) return;
      const ids = new Set(s.accounts.map((a) => a.id));
      for (const a of prev.accounts) if (!ids.has(a.id)) this.forgetAccount(a.id);
    });
  }

  private forgetAccount(id: AccountId) {
    delete this.lastSync[id];
    for (const k of Object.keys(this.seenUpdated)) if (parseListKey(k).accountId === id) delete this.seenUpdated[k];
  }

  private hasAccount(id: AccountId) {
    return this.store.getState().accounts.some((a) => a.id === id);
  }

  start(): Promise<void> {
    this.stopped = false;
    return this.run();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimer();
  }

  syncNow(): Promise<void> {
    return this.run();
  }

  pause(): void {
    this.paused = true;
    this.clearTimer();
  }

  resume(): void {
    this.paused = false;
    void this.syncNow();
  }

  private clearTimer() {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
  }

  private run(): Promise<void> {
    if (!this.inFlight) {
      this.clearTimer();
      this.inFlight = this.cycleOnce().finally(() => {
        this.inFlight = null;
        this.schedule();
      });
    }
    return this.inFlight;
  }

  private schedule() {
    if (this.paused || this.stopped) return;
    this.clearTimer();
    const s = this.store.getState();
    this.timer = this.clock.setTimeout(() => void this.syncNow(), Math.min(s.settings.pollIntervalSec * 1000 + s.sync.backoffMs, MAX_BACKOFF_MS));
  }

  private async cycleOnce(): Promise<void> {
    const st = () => this.store.getState();
    const full = this.cycle % FULL_EVERY === 0;
    this.cycle++;
    const startedAt = this.clock.now();
    st().setSync({ phase: "syncing" });

    const failures = new Set<Failure>();
    let message: string | undefined;
    let anyOk = false;
    for (const account of st().accounts.filter((a) => !a.needsReauth)) {
      try {
        await this.syncAccount(account, full || this.lastSync[account.id] === undefined, startedAt);
        if (this.hasAccount(account.id)) {
          this.lastSync[account.id] = startedAt;
          anyOk = true;
        } else this.forgetAccount(account.id); // removed while its sync was in flight
      } catch (e) {
        const kind = classify(e);
        if (kind === "reauth") st().markReauth(account.id);
        else failures.add(kind);
        if (kind === "other") message = e instanceof Error ? e.message : String(e);
      }
    }

    if (anyOk) this.store.setState({ writesEnabled: true });
    const { sync } = st();
    if (failures.has("rate")) {
      const interval = st().settings.pollIntervalSec * 1000;
      const backoffMs = Math.min(sync.backoffMs ? sync.backoffMs * 2 : 2 * interval, MAX_BACKOFF_MS);
      if (!sync.backoffMs) st().toast("Google rate limit reached; syncing less often for a while");
      st().setSync({ backoffMs });
    }
    if (failures.has("offline")) st().setSync({ phase: "offline", message: undefined });
    else if (failures.has("rate")) st().setSync({ phase: "error", message: "Rate limited" });
    else if (failures.has("other")) st().setSync({ phase: "error", message });
    else {
      st().setSync({ phase: "idle", message: undefined, backoffMs: 0, lastSyncAt: this.clock.now() });
      st().persistCache();
    }
  }

  private async syncAccount(account: Account, full: boolean, startedAt: number) {
    const lists = await this.api.listTaskLists(account.id);
    this.store.getState().setLists(account.id, lists);
    for (const l of lists) {
      const key = listKey(account.id, l.id);
      if (!full && this.skipUnchangedLists && this.seenUpdated[key] === l.updated) continue;
      const tasks = full
        ? await this.fullListTasks(account.id, l.id, startedAt)
        : await this.api.listTasks(account.id, l.id, {
            updatedMin: new Date(this.lastSync[account.id] - OVERLAP_MS).toISOString(),
            showDeleted: true,
          });
      this.store.getState().applyListTasks(key, tasks, full);
      this.seenUpdated[key] = l.updated;
    }
  }

  /** Open tasks plus tasks completed in the last 30 days (completedMin alone would drop every open task). */
  private async fullListTasks(accountId: AccountId, listId: string, startedAt: number): Promise<Task[]> {
    const open = await this.api.listTasks(accountId, listId, { showCompleted: false });
    const done = await this.api.listTasks(accountId, listId, {
      completedMin: new Date(startedAt - 30 * DAY_MS).toISOString(),
    });
    const byId = new Map<string, Task>();
    for (const t of [...open, ...done]) byId.set(t.id, t);
    return [...byId.values()];
  }
}
