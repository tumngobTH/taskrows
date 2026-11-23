import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ListColumn from "./ListColumn";
import { createTaskStore, setAppStore } from "../store/store";
import { createMemoryPersistence } from "../layout/persistence";
import type { TasksApi } from "../api/tasksApi";
import type { Task, Group } from "../types";

const mk = (id: string, status: Task["status"], title = id): Task => ({
  accountId: "a1", listId: "l1", id, title, status, updated: "", position: id,
});

function setup(showCompleted: boolean) {
  const api = { insertTask: async (_a: string, _l: string, b: { title: string }) => mk("new", "needsAction", b.title) } as unknown as TasksApi;
  const store = createTaskStore({ api, persist: createMemoryPersistence() });
  setAppStore(store);
  store.getState().hydrate(
    {
      lists: { "a1:l1": { accountId: "a1", id: "l1", title: "Work", updated: "" } },
      tasks: { "a1:t1": mk("t1", "needsAction"), "a1:d1": mk("d1", "completed"), "a1:d2": mk("d2", "completed") },
    },
    null,
    { ...store.getState().settings, showCompleted },
    [{ id: "a1", email: "a@b.c", color: "#2563eb", needsReauth: false }],
  );
  store.setState({ writesEnabled: true });
  const group: Group = store.getState().groups[0];
  return { store, group };
}

describe("ListColumn", () => {
  it("hides the completed section when showCompleted is false", () => {
    const { group } = setup(false);
    render(<ListColumn group={group} />);
    expect(screen.getByText("t1")).toBeInTheDocument();
    expect(screen.queryByText(/Completed/)).toBeNull();
  });

  it("shows 'Completed (2)' collapsed, and expands to done tasks", () => {
    const { group } = setup(true);
    render(<ListColumn group={group} />);
    const btn = screen.getByRole("button", { name: "Completed (2)" });
    expect(screen.queryByText("d1")).toBeNull();
    fireEvent.click(btn);
    expect(screen.getByRole("checkbox", { name: "d1" })).toBeChecked();
  });

  it("adds a task on Enter and clears the input", async () => {
    const { store, group } = setup(false);
    render(<ListColumn group={group} />);
    const input = screen.getByPlaceholderText("Add a task");
    fireEvent.change(input, { target: { value: "  hello  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input).toHaveValue("");
    await waitFor(() => expect(Object.values(store.getState().tasks).some((t) => t.id === "new")).toBe(true));
    expect(await screen.findByText("hello")).toBeInTheDocument();
  });
});
