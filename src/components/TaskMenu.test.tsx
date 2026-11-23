import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TaskMenu from "./TaskMenu";
import { createTaskStore, setAppStore } from "../store/store";
import { createMemoryPersistence } from "../layout/persistence";
import { ymdToDue } from "../lib/dates";
import type { TasksApi } from "../api/tasksApi";

const KEY = "a:t1";
const setup = (writesEnabled = true) => {
  const store = createTaskStore({ api: {} as TasksApi, persist: createMemoryPersistence() });
  setAppStore(store);
  const updateTask = vi.fn(async () => {});
  const deleteTask = vi.fn(async () => {});
  const moveTask = vi.fn(async () => {});
  store.setState({
    writesEnabled,
    updateTask,
    deleteTask,
    moveTask,
    lists: {
      "a:l1": { accountId: "a", id: "l1", title: "Home", updated: "" },
      "a:l2": { accountId: "a", id: "l2", title: "Work", updated: "" },
      "b:l3": { accountId: "b", id: "l3", title: "Other acct", updated: "" },
    },
    tasks: { [KEY]: { accountId: "a", listId: "l1", id: "t1", title: "T", status: "needsAction", updated: "", position: "1", due: ymdToDue("2026-11-01"), notes: "old" } },
  });
  render(<TaskMenu taskKey={KEY} />);
  fireEvent.click(screen.getByRole("button", { name: "Task menu" }));
  return { updateTask, deleteTask, moveTask };
};

beforeEach(() => vi.restoreAllMocks());

describe("TaskMenu", () => {
  it("Clear due sends due: null", () => {
    const { updateTask } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(updateTask).toHaveBeenCalledWith(KEY, { due: null });
  });

  it("a complete date saves once (change then blur) and keeps the menu open", () => {
    const { updateTask } = setup();
    const f = screen.getByLabelText("Due date");
    fireEvent.change(f, { target: { value: "2026-12-01" } });
    fireEvent.blur(f);
    expect(updateTask).toHaveBeenCalledTimes(1);
    expect(updateTask).toHaveBeenCalledWith(KEY, { due: "2026-12-01T00:00:00.000Z" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("an implausible year is never saved", () => {
    const { updateTask } = setup();
    const f = screen.getByLabelText("Due date");
    fireEvent.change(f, { target: { value: "0002-12-01" } });
    fireEvent.blur(f);
    expect(updateTask).not.toHaveBeenCalled();
  });

  it("a note typed then Escape is flushed, not lost", () => {
    const { updateTask } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Edit notes" }));
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "hello" } });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(updateTask).toHaveBeenCalledWith(KEY, { notes: "hello" });
  });

  it("a note typed then an outside click is flushed once", () => {
    const { updateTask } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Edit notes" }));
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "hi" } });
    fireEvent.mouseDown(document.body);
    expect(updateTask).toHaveBeenCalledTimes(1);
    expect(updateTask).toHaveBeenCalledWith(KEY, { notes: "hi" });
  });

  it("Delete asks for confirmation first", () => {
    const { deleteTask } = setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleteTask).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(deleteTask).toHaveBeenCalledWith(KEY);
  });

  it("Move to list offers only the same account's other lists", () => {
    const { moveTask } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Move to list…" }));
    expect(screen.queryByRole("button", { name: "Home" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Other acct" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Work" }));
    expect(moveTask).toHaveBeenCalledWith(KEY, { listKey: "a:l2", previousTaskId: null });
  });

  it("notes save on blur, empty becomes null", () => {
    const { updateTask } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Edit notes" }));
    const ta = screen.getByLabelText("Notes");
    fireEvent.change(ta, { target: { value: "" } });
    fireEvent.blur(ta);
    expect(updateTask).toHaveBeenCalledWith(KEY, { notes: null });
  });

  it("Escape closes the menu", () => {
    setup();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("actions are disabled while writes are off", () => {
    setup(false);
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });
});
