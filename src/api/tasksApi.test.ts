import { describe, it, expect } from "vitest";
import { TasksApi, ApiError } from "./tasksApi";

type Call = { url: string; init: RequestInit };

function fakeFetch(responses: Array<{ status: number; body?: unknown }>) {
  const calls: Call[] = [];
  let i = 0;
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const r = responses[Math.min(i++, responses.length - 1)];
    const text = r.body === undefined ? null : JSON.stringify(r.body);
    return new Response(text, {
      status: r.status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const tokens = (log: string[] = []) => ({
  getToken: async (id: string) => {
    log.push(id);
    return `tok${log.length}`;
  },
});

const rawTask = (id: string) => ({
  kind: "tasks#task",
  etag: "x",
  id,
  title: id,
  status: "needsAction",
  updated: "2026-01-01T00:00:00Z",
  position: "0001",
  selfLink: "s",
});

describe("TasksApi", () => {
  it("listTasks_follows_pageToken_and_sets_flags", async () => {
    const { fn, calls } = fakeFetch([
      { status: 200, body: { items: [rawTask("a")], nextPageToken: "NP" } },
      { status: 200, body: { items: [rawTask("b")] } },
    ]);
    const api = new TasksApi(tokens(), fn);
    const out = await api.listTasks("acc1", "L 1", {});
    expect(out.map((t) => t.id)).toEqual(["a", "b"]);
    expect(out[0]).toMatchObject({ accountId: "acc1", listId: "L 1" });
    expect("etag" in out[0]).toBe(false);
    const u1 = new URL(calls[0].url);
    expect(u1.pathname).toBe("/tasks/v1/lists/L%201/tasks");
    expect(u1.searchParams.get("showCompleted")).toBe("true");
    expect(u1.searchParams.get("showHidden")).toBe("true");
    expect(u1.searchParams.get("maxResults")).toBe("100");
    expect(u1.searchParams.has("pageToken")).toBe(false);
    expect(u1.searchParams.has("showDeleted")).toBe(false);
    expect(new URL(calls[1].url).searchParams.get("pageToken")).toBe("NP");
  });

  it("listTasks_passes_updatedMin_and_showDeleted", async () => {
    const { fn, calls } = fakeFetch([{ status: 200, body: {} }]);
    const api = new TasksApi(tokens(), fn);
    const out = await api.listTasks("a", "l", {
      updatedMin: "2026-01-01T00:00:00Z",
      completedMin: "2026-02-01T00:00:00Z",
      showDeleted: true,
    });
    expect(out).toEqual([]);
    const p = new URL(calls[0].url).searchParams;
    expect(p.get("updatedMin")).toBe("2026-01-01T00:00:00Z");
    expect(p.get("completedMin")).toBe("2026-02-01T00:00:00Z");
    expect(p.get("showDeleted")).toBe("true");
  });

  it("listTasks_sends_showCompleted_false_when_requested", async () => {
    const { fn, calls } = fakeFetch([{ status: 200, body: {} }]);
    const api = new TasksApi(tokens(), fn);
    await api.listTasks("a", "l", { showCompleted: false });
    expect(new URL(calls[0].url).searchParams.get("showCompleted")).toBe("false");
  });

  it("moveTask_uses_destinationTasklist_and_restamps_listId", async () => {
    const { fn, calls } = fakeFetch([{ status: 200, body: rawTask("t1") }]);
    const api = new TasksApi(tokens(), fn);
    const t = await api.moveTask("acc", "src", "t1", {
      destinationTasklist: "dst",
      previous: "p",
    });
    expect(t.listId).toBe("dst");
    expect(t.accountId).toBe("acc");
    const u = new URL(calls[0].url);
    expect(u.pathname).toBe("/tasks/v1/lists/src/tasks/t1/move");
    expect(u.searchParams.get("destinationTasklist")).toBe("dst");
    expect(u.searchParams.get("previous")).toBe("p");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.body).toBeUndefined();
  });

  it("retries_once_on_401", async () => {
    const log: string[] = [];
    const { fn, calls } = fakeFetch([
      { status: 401, body: { error: { message: "no", errors: [{ reason: "authError" }] } } },
      { status: 200, body: { items: [{ id: "L", title: "T", updated: "u", kind: "k" }] } },
    ]);
    const api = new TasksApi(tokens(log), fn);
    const lists = await api.listTaskLists("acc");
    expect(lists).toEqual([{ accountId: "acc", id: "L", title: "T", updated: "u" }]);
    expect(calls).toHaveLength(2);
    expect(log).toHaveLength(2);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer tok1");
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe("Bearer tok2");

    const two = fakeFetch([{ status: 401, body: {} }]);
    await expect(new TasksApi(tokens(), two.fn).listTaskLists("a")).rejects.toMatchObject({
      status: 401,
    });
    expect(two.calls).toHaveLength(2);
  });

  it("throws_ApiError_with_reason_on_403", async () => {
    const { fn } = fakeFetch([
      { status: 403, body: { error: { message: "Quota", errors: [{ reason: "rateLimitExceeded" }] } } },
    ]);
    const api = new TasksApi(tokens(), fn);
    const err = await api.deleteTask("a", "l", "t").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(403);
    expect(err.reason).toBe("rateLimitExceeded");
    expect(err.message).toBe("Quota");
  });
});
