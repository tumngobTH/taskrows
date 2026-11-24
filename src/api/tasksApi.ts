import type { AccountId, Task, TaskList } from "../types";

export interface TokenProvider {
  getToken(accountId: AccountId): Promise<string>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public reason: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Raw = Record<string, unknown>;

const TASK_FIELDS = [
  "id",
  "title",
  "notes",
  "status",
  "due",
  "completed",
  "updated",
  "position",
  "parent",
  "deleted",
  "hidden",
] as const;

export class TasksApi {
  constructor(
    private tokens: TokenProvider,
    private fetchFn: typeof fetch = (...args) => fetch(...args),
    private base = "https://tasks.googleapis.com/tasks/v1",
  ) {}

  async listTaskLists(accountId: AccountId): Promise<TaskList[]> {
    const out: TaskList[] = [];
    let pageToken: string | undefined;
    do {
      const q = new URLSearchParams();
      if (pageToken) q.set("pageToken", pageToken);
      const page = await this.request<{ items?: Raw[]; nextPageToken?: string }>(
        accountId,
        "GET",
        "/users/@me/lists",
        q,
      );
      for (const r of page.items ?? []) {
        out.push({
          accountId,
          id: r.id as string,
          title: r.title as string,
          updated: r.updated as string,
        });
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
    return out;
  }

  async listTasks(
    accountId: AccountId,
    listId: string,
    opts: { updatedMin?: string; completedMin?: string; showDeleted?: boolean; showCompleted?: boolean },
  ): Promise<Task[]> {
    const out: Task[] = [];
    let pageToken: string | undefined;
    do {
      const q = new URLSearchParams({
        showCompleted: String(opts.showCompleted ?? true),
        showHidden: "true",
        maxResults: "100",
      });
      if (pageToken) q.set("pageToken", pageToken);
      if (opts.updatedMin) q.set("updatedMin", opts.updatedMin);
      if (opts.completedMin) q.set("completedMin", opts.completedMin);
      if (opts.showDeleted) q.set("showDeleted", "true");
      const page = await this.request<{ items?: Raw[]; nextPageToken?: string }>(
        accountId,
        "GET",
        `/lists/${encodeURIComponent(listId)}/tasks`,
        q,
      );
      for (const r of page.items ?? []) out.push(this.stamp(r, accountId, listId));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return out;
  }

  async insertTask(
    accountId: AccountId,
    listId: string,
    body: { title: string; notes?: string; due?: string; status?: Task["status"]; completed?: string },
    opts: { parent?: string; previous?: string } = {},
  ): Promise<Task> {
    const q = new URLSearchParams();
    if (opts.parent) q.set("parent", opts.parent);
    if (opts.previous) q.set("previous", opts.previous);
    const r = await this.request<Raw>(
      accountId,
      "POST",
      `/lists/${encodeURIComponent(listId)}/tasks`,
      q,
      body,
    );
    return this.stamp(r, accountId, listId);
  }

  async patchTask(
    accountId: AccountId,
    listId: string,
    taskId: string,
    patch: {
      title?: string;
      notes?: string | null;
      due?: string | null;
      status?: Task["status"];
      completed?: null;
    },
  ): Promise<Task> {
    const r = await this.request<Raw>(
      accountId,
      "PATCH",
      `/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`,
      undefined,
      patch,
    );
    return this.stamp(r, accountId, listId);
  }

  async deleteTask(accountId: AccountId, listId: string, taskId: string): Promise<void> {
    await this.request<unknown>(
      accountId,
      "DELETE",
      `/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`,
    );
  }

  async moveTask(
    accountId: AccountId,
    listId: string,
    taskId: string,
    opts: { previous?: string; parent?: string; destinationTasklist?: string },
  ): Promise<Task> {
    const q = new URLSearchParams();
    if (opts.previous) q.set("previous", opts.previous);
    if (opts.parent) q.set("parent", opts.parent);
    if (opts.destinationTasklist) q.set("destinationTasklist", opts.destinationTasklist);
    const r = await this.request<Raw>(
      accountId,
      "POST",
      `/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}/move`,
      q,
    );
    return this.stamp(r, accountId, opts.destinationTasklist ?? listId);
  }

  private stamp(raw: Raw, accountId: AccountId, listId: string): Task {
    const t: Record<string, unknown> = { accountId, listId };
    for (const k of TASK_FIELDS) if (raw[k] !== undefined) t[k] = raw[k];
    return t as unknown as Task;
  }

  private async request<T>(
    accountId: AccountId,
    method: string,
    path: string,
    query?: URLSearchParams,
    body?: unknown,
  ): Promise<T> {
    const qs = query && query.toString() ? `?${query.toString()}` : "";
    const url = `${this.base}${path}${qs}`;
    let res: Response | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.tokens.getToken(accountId);
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      const init: RequestInit = { method, headers };
      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
        init.body = JSON.stringify(body);
      }
      res = await this.fetchFn(url, init);
      if (res.status !== 401) break;
    }
    const r = res as Response;
    const text = await r.text();
    let json: any;
    let parsed = false;
    if (text) {
      try {
        json = JSON.parse(text);
        parsed = true;
      } catch {
        /* non-JSON body */
      }
    }
    if (!r.ok) {
      const reason = parsed ? (json?.error?.errors?.[0]?.reason ?? "") : "";
      const message =
        (parsed ? json?.error?.message : undefined) || r.statusText || `HTTP ${r.status}`;
      throw new ApiError(r.status, reason, message);
    }
    return (parsed ? json : undefined) as T;
  }
}
