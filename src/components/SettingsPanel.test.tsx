import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
    fireEvent.change(screen.getByLabelText("Poll interval (seconds)"), { target: { value: "5" } });
    expect(store.getState().settings.pollIntervalSec).toBe(15);
  });

  it("list width 400 is stored and applied as --list-width", () => {
    const { store } = make();
    fireEvent.change(screen.getByLabelText("List width (px)"), { target: { value: "400" } });
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
    expect([s.showCompleted, s.fontSize, s.theme]).toEqual([true, "L", "dark"]);
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
