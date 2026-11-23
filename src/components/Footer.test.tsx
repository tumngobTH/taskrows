import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Footer from "./Footer";
import { createTaskStore, setAppStore } from "../store/store";
import { createMemoryPersistence } from "../layout/persistence";
import type { TasksApi } from "../api/tasksApi";
import type { SyncEngine } from "../sync/syncEngine";

const acct = (id: string, needsReauth: boolean) => ({ id, email: `${id}@x.y`, color: "#2563eb", needsReauth });

function setup(accounts: ReturnType<typeof acct>[]) {
  const store = createTaskStore({ api: {} as TasksApi, persist: createMemoryPersistence() });
  setAppStore(store);
  store.getState().hydrate(null, null, null, accounts);
  const onSettings = vi.fn();
  render(<Footer engine={{ syncNow: vi.fn() } as unknown as SyncEngine} onSettings={onSettings} />);
  return { onSettings };
}

describe("Footer", () => {
  it("shows how many accounts need sign-in and opens Settings", () => {
    const { onSettings } = setup([acct("a", true), acct("b", true), acct("c", false)]);
    fireEvent.click(screen.getByRole("button", { name: "2 accounts need sign-in" }));
    expect(onSettings).toHaveBeenCalled();
  });

  it("uses singular wording for one account", () => {
    setup([acct("a", true)]);
    expect(screen.getByRole("button", { name: "1 account needs sign-in" })).toBeInTheDocument();
  });

  it("no sign-in notice when no account needs it", () => {
    setup([acct("a", false)]);
    expect(screen.queryByText(/need.? sign-in/)).toBeNull();
    expect(screen.getByText("Synced")).toBeInTheDocument();
  });
});
