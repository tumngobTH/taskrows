import type { StoreApi } from "zustand/vanilla";
import type { Account, AccountId, ListKey } from "../types";
import { ApiError, type TasksApi } from "../api/tasksApi";
import { listKey } from "../lib/ids";
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
  if (e instanceof ApiError) {
    if (e.status === 401) return "reauth";
    if (e.status === 429 || (e.status === 403 && RATE_REASONS.includes(e.reason))) return "rate";
    return "other";
  }
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes("reauth_required") ? "reauth" : "other";
}

export class SyncEngine {
  private cycle = 0;
  private lastSync: Record<AccountId, number> = {};
  private seenUpdated: Record<ListKey, string> = {};
  private paused = false;
  private stopped = true;
  private timer: unknown = null;
  private inFlight: Promise<void> | null = null;

  constructor(
    private store: StoreApi<State & Actions>,
    private api: TasksApi,
    private clock: Clock = realClock,
  ) {}

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
    this.timer = this.clock.setTimeout(() => void this.syncNow(), s.settings.pollIntervalSec * 1000 + s.sync.backoffMs);
  }

  private async cycleOnce(): Promise<void> {
    const st = () => this.store.getState();
    const full = this.cycle % FULL_EVERY === 0;
    this.cycle++;
    const startedAt = this.clock.now();
    st().setSync({ phase: "syncing" });

    const failures = new Set<Failure>();
    let message: string | undefined;
    for (const account of st().accounts.filter((a) => !a.needsReauth)) {
      try {
        await this.syncAccount(account, full || this.lastSync[account.id] === undefined, startedAt);
        this.lastSync[account.id] = startedAt;
      } catch (e) {
        const kind = classify(e);
        if (kind === "reauth") st().markReauth(account.id);
        else failures.add(kind);
        if (kind === "other") message = e instanceof Error ? e.message : String(e);
      }
    }

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
      this.store.setState({ writesEnabled: true });
      st().persistCache();
    }
  }

  private async syncAccount(account: Account, full: boolean, startedAt: number) {
    const lists = await this.api.listTaskLists(account.id);
    this.store.getState().setLists(account.id, lists);
    for (const l of lists) {
      const key = listKey(account.id, l.id);
      if (!full && this.seenUpdated[key] === l.updated) continue;
      const tasks = full
        ? await this.api.listTasks(account.id, l.id, { completedMin: new Date(startedAt - 30 * DAY_MS).toISOString() })
        : await this.api.listTasks(account.id, l.id, {
            updatedMin: new Date(this.lastSync[account.id] - OVERLAP_MS).toISOString(),
            showDeleted: true,
          });
      this.store.getState().applyListTasks(key, tasks, full);
      this.seenUpdated[key] = l.updated;
    }
  }
}
