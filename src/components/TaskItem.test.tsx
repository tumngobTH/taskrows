import { describe, it, expect, vi } from "vitest";
import * as sortable from "@dnd-kit/sortable";
import { render, screen, fireEvent } from "@testing-library/react";
import BoardDnd from "../dnd/BoardDnd";
import TaskItem from "./TaskItem";
import { createTaskStore, setAppStore } from "../store/store";
import { createMemoryPersistence } from "../layout/persistence";
import { todayYmd, ymdToDue } from "../lib/dates";
import type { TasksApi } from "../api/tasksApi";
import type { Task } from "../types";

const spies = vi.hoisted(() => ({ pointer: vi.fn(), key: vi.fn() }));
vi.mock("@dnd-kit/sortable", async (orig) => {
  const actual = await orig<typeof sortable>();
  return {
    ...actual,
    useSortable: (args: Parameters<typeof actual.useSortable>[0]) => {
      const r = actual.useSortable(args);
      return { ...r, listeners: { ...r.listeners, onPointerDown: spies.pointer, onKeyDown: spies.key } };
    },
  };
});

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

  it("marks only open synced rows as draggable", () => {
    setup();
    const { container, rerender } = render(<ul><TaskItem task={base} depth={0} /></ul>);
    expect(container.querySelector("li")).toHaveClass("draggable");
    rerender(<ul><TaskItem task={{ ...base, status: "completed" }} depth={0} /></ul>);
    expect(container.querySelector("li")).not.toHaveClass("draggable");
    rerender(<ul><TaskItem task={{ ...base, id: "tmp:x" }} depth={0} /></ul>);
    expect(container.querySelector("li")).not.toHaveClass("draggable");
  });

  it("pointerdown on the title starts a drag but on the checkbox does not", () => {
    setup();
    spies.pointer.mockClear();
    const { container } = render(<ul><TaskItem task={base} depth={0} /></ul>);
    fireEvent.pointerDown(screen.getByRole("checkbox", { name: "Buy milk" }));
    expect(spies.pointer).not.toHaveBeenCalled();
    fireEvent.pointerDown(container.querySelector(".title")!);
    expect(spies.pointer).toHaveBeenCalledTimes(1);
  });

  it("keyboard drag handler is on the grip only, not the checkbox", () => {
    setup();
    spies.key.mockClear();
    render(<ul><TaskItem task={base} depth={0} /></ul>);
    fireEvent.keyDown(screen.getByRole("checkbox", { name: "Buy milk" }), { key: " ", code: "Space" });
    expect(spies.key).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("button", { name: "Drag task" }), { key: " ", code: "Space" });
    expect(spies.key).toHaveBeenCalledTimes(1);
  });
});
