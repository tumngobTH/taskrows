import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import * as tauri from "../lib/tauri";
import SettingsPanel from "./SettingsPanel";
import { applySettings } from "../app/applySettings";
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

const make = () => {
  const store = createTaskStore({ api: {} as TasksApi, persist: createMemoryPersistence() });
  store.getState().hydrate(null, null, null, [{ id: "a", email: "a@x.y", color: "#2563eb", needsReauth: false }]);
  const engine = { start: vi.fn(), syncNow: vi.fn() } as unknown as SyncEngine;
  const onClose = vi.fn();
  render(<SettingsPanel store={store} engine={engine} onClose={onClose} />);
  return { store, onClose };
};

beforeEach(() => document.documentElement.removeAttribute("style"));

describe("SettingsPanel", () => {
  it("clamps a poll interval of 5 up to 15", () => {
    const { store } = make();
    const f = screen.getByLabelText("Poll interval (seconds)");
    fireEvent.change(f, { target: { value: "5" } });
    fireEvent.blur(f);
    expect(store.getState().settings.pollIntervalSec).toBe(15);
  });

  it("list width 400 is stored and applied as --list-width", () => {
    const { store } = make();
    const f = screen.getByLabelText("List width (px)");
    fireEvent.change(f, { target: { value: "400" } });
    fireEvent.blur(f);
    expect(store.getState().settings.listWidth).toBe(400);
    applySettings(store.getState().settings);
    expect(document.documentElement.style.getPropertyValue("--list-width")).toBe("400px");
  });

  it("toggles, font size and theme update the store", () => {
    const { store } = make();
    fireEvent.click(screen.getByLabelText("Show completed"));
    fireEvent.click(screen.getByLabelText("Large"));
    fireEvent.click(screen.getByLabelText("Dark"));
    const s = store.getState().settings;
    expect([s.showCompleted, s.fontSize, s.theme]).toEqual([false, "L", "dark"]); // Show completed defaults to on
  });

  it("shows the OAuth client ID read-only and Change reopens the client form", async () => {
    vi.mocked(tauri.getOauthClient).mockResolvedValue("cid-123");
    vi.mocked(tauri.setOauthClient).mockResolvedValue();
    make();
    expect(await screen.findByText("cid-123")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    fireEvent.change(screen.getByLabelText("Client ID"), { target: { value: "new-id" } });
    fireEvent.change(screen.getByLabelText("Client secret"), { target: { value: "new-sec" } });
    vi.mocked(tauri.getOauthClient).mockResolvedValue("new-id");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("new-id")).toBeInTheDocument();
    expect(tauri.setOauthClient).toHaveBeenCalledWith("new-id", "new-sec");
    expect(screen.queryByLabelText("Client secret")).toBeNull();
  });

  it("picking a colour updates the account", () => {
    const { store } = make();
    fireEvent.click(screen.getByRole("button", { name: "Set a@x.y colour to #dc2626" }));
    expect(store.getState().accounts[0].color).toBe("#dc2626");
  });

  it("close button calls onClose", () => {
    const { onClose } = make();
    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
    expect(onClose).toHaveBeenCalled();
  });
});
