import { vi } from "vitest";
import { describe, it, expect } from "vitest";
import { minimizeTransition } from "./bootstrap";

vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: vi.fn() }));

describe("minimizeTransition", () => {
  it("pauses only on false->true", () => expect(minimizeTransition(false, true)).toBe("pause"));
  it("resumes only on true->false", () => expect(minimizeTransition(true, false)).toBe("resume"));
  it("does nothing when unchanged", () => {
    expect(minimizeTransition(false, false)).toBeNull();
    expect(minimizeTransition(true, true)).toBeNull();
  });
});
