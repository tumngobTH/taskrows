import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AccountsPanel from "./AccountsPanel";
import { createTaskStore } from "../store/store";
import { createMemoryPersistence } from "../layout/persistence";
import type { TasksApi } from "../api/tasksApi";
import type { SyncEngine } from "../sync/syncEngine";

vi.mock("../lib/tauri", () => ({
  getOauthClient: vi.fn(),
  setOauthClient: vi.fn(),
  startSignIn: vi.fn(),
  getAccessToken: vi.fn(),
  removeAccount: vi.fn(),
}));
import * as tauri from "../lib/tauri";

const make = (accounts: { id: string; needsReauth?: boolean }[]) => {
  const store = createTaskStore({ api: {} as TasksApi, persist: createMemoryPersistence() });
  store.getState().hydrate(null, null, null, accounts.map((a) => ({ id: a.id, email: `${a.id}@x.y`, color: "#000", needsReauth: !!a.needsReauth })));
  const engine = { start: vi.fn(), syncNow: vi.fn() } as unknown as SyncEngine;
  return { store, engine };
};

beforeEach(() => vi.clearAllMocks());

describe("AccountsPanel", () => {
  it("disables Add account at 3 accounts", () => {
    const { store, engine } = make([{ id: "a" }, { id: "b" }, { id: "c" }]);
    render(<AccountsPanel store={store} engine={engine} />);
    expect(screen.getByRole("button", { name: "Add account" })).toBeDisabled();
  });

  it("starts only one sign-in on a double click", async () => {
    let resolve!: (v: { id: string; email: string }) => void;
    vi.mocked(tauri.startSignIn).mockReturnValue(new Promise((r) => (resolve = r)));
    const { store, engine } = make([{ id: "a" }]);
    render(<AccountsPanel store={store} engine={engine} />);
    const btn = screen.getByRole("button", { name: "Add account" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(tauri.startSignIn).toHaveBeenCalledTimes(1);
    expect(btn).toBeDisabled();
    resolve({ id: "b", email: "b@x.y" });
    await vi.waitFor(() => expect(btn).not.toBeDisabled());
  });

  it("shows Sign in again only when needsReauth", () => {
    const { store, engine } = make([{ id: "a", needsReauth: true }, { id: "b" }]);
    render(<AccountsPanel store={store} engine={engine} />);
    expect(screen.getAllByRole("button", { name: "Sign in again" })).toHaveLength(1);
  });
});
