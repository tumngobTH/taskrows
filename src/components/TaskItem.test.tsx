import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BoardDnd from "../dnd/BoardDnd";
import TaskItem from "./TaskItem";
import { createTaskStore, setAppStore } from "../store/store";
import { createMemoryPersistence } from "../layout/persistence";
import { todayYmd, ymdToDue } from "../lib/dates";
import type { TasksApi } from "../api/tasksApi";
import type { Task } from "../types";

const base: Task = { accountId: "a1", listId: "l1", id: "t1", title: "Buy milk", status: "needsAction", updated: "", position: "1" };

const setup = () => setAppStore(createTaskStore({ api: {} as TasksApi, persist: createMemoryPersistence() }));

describe("TaskItem", () => {
  it("shows a due-today chip with data-due=today", () => {
    setup();
    render(<ul><TaskItem task={{ ...base, due: ymdToDue(todayYmd()) }} depth={0} /></ul>);
    const chip = screen.getByText("Today");
    expect(chip).toHaveAttribute("data-due", "today");
  });

  it("renders a 120-character Thai title in full", () => {
    setup();
    const title = "ก".repeat(120);
    const { container } = render(<ul><TaskItem task={{ ...base, title }} depth={0} /></ul>);
    expect(container.textContent).toContain(title);
  });

  it("disables the checkbox of a pending tmp: task", () => {
    setup();
    render(<ul><TaskItem task={{ ...base, id: "tmp:x" }} depth={0} /></ul>);
    expect(screen.getByRole("checkbox", { name: "Buy milk" })).toBeDisabled();
  });

  it("Space on the checkbox toggles it and does not start a keyboard drag", () => {
    const store = createTaskStore({ api: {} as TasksApi, persist: createMemoryPersistence() });
    setAppStore(store);
    const toggleComplete = vi.fn(async () => {});
    store.setState({ toggleComplete });
    render(
      <BoardDnd>
        <ul><TaskItem task={base} depth={0} /></ul>
      </BoardDnd>,
    );
    const box = screen.getByRole("checkbox", { name: "Buy milk" });
    box.focus();
    // fireEvent returns false when a handler called preventDefault (which would cancel the native toggle).
    expect(fireEvent.keyDown(box, { key: " ", code: "Space" })).toBe(true);
    fireEvent.click(box);
    expect(toggleComplete).toHaveBeenCalledWith("a1:t1");
    expect(screen.getByRole("button", { name: "Drag task" })).not.toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("listitem")).not.toHaveAttribute("role", "button");
  });
});
