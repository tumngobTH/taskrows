import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import SignInGate from "./SignInGate";
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

const make = () => {
  const store = createTaskStore({ api: {} as TasksApi, persist: createMemoryPersistence() });
  const engine = { start: vi.fn(), syncNow: vi.fn() } as unknown as SyncEngine;
  return { store, engine };
};

beforeEach(() => vi.clearAllMocks());

describe("SignInGate", () => {
  it("shows the client form when no client is stored", async () => {
    vi.mocked(tauri.getOauthClient).mockResolvedValue(null);
    const { store, engine } = make();
    render(<SignInGate store={store} engine={engine} />);
    expect(await screen.findByLabelText("Client ID")).toBeInTheDocument();
    expect(screen.getByLabelText("Client secret")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("saves the client then shows Add Google account", async () => {
    vi.mocked(tauri.getOauthClient).mockResolvedValueOnce(null).mockResolvedValue("id");
    vi.mocked(tauri.setOauthClient).mockResolvedValue();
    const { store, engine } = make();
    render(<SignInGate store={store} engine={engine} />);
    fireEvent.change(await screen.findByLabelText("Client ID"), { target: { value: "abc" } });
    fireEvent.change(screen.getByLabelText("Client secret"), { target: { value: "sec" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("button", { name: "Add Google account" })).toBeInTheDocument();
    expect(tauri.setOauthClient).toHaveBeenCalledWith("abc", "sec");
  });

  it("shows Add Google account when a client exists and there are no accounts", async () => {
    vi.mocked(tauri.getOauthClient).mockResolvedValue("client-id");
    const { store, engine } = make();
    render(<SignInGate store={store} engine={engine} />);
    expect(await screen.findByText("Add your Google account to get started")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Google account" })).toBeInTheDocument();
  });

  it("adds the account, starts the engine, and shows sign-in errors as text", async () => {
    vi.mocked(tauri.getOauthClient).mockResolvedValue("client-id");
    vi.mocked(tauri.startSignIn).mockRejectedValueOnce("timeout").mockResolvedValueOnce({ id: "u1", email: "a@b.c" });
    const { store, engine } = make();
    render(<SignInGate store={store} engine={engine} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add Google account" }));
    expect(await screen.findByText("timeout")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add Google account" }));
    await waitFor(() => expect(store.getState().accounts).toHaveLength(1));
    expect(engine.start).toHaveBeenCalled();
  });
  it("Change OAuth client… shows the client form again", async () => {
    vi.mocked(tauri.getOauthClient).mockResolvedValue("client-id");
    vi.mocked(tauri.setOauthClient).mockResolvedValue();
    const { store, engine } = make();
    render(<SignInGate store={store} engine={engine} />);
    fireEvent.click(await screen.findByRole("button", { name: "Change OAuth client…" }));
    fireEvent.change(screen.getByLabelText("Client ID"), { target: { value: "fixed" } });
    fireEvent.change(screen.getByLabelText("Client secret"), { target: { value: "sec2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("button", { name: "Add Google account" })).toBeInTheDocument();
    expect(tauri.setOauthClient).toHaveBeenCalledWith("fixed", "sec2");
  });
});
