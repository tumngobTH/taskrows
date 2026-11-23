import type { Settings } from "../types";

/** DOM-side effects of the display settings (theme, font size, list width). */
export function applySettings(s: Settings): void {
  const root = document.documentElement;
  if (s.theme === "system") delete root.dataset.theme;
  else root.dataset.theme = s.theme;
  root.dataset.font = s.fontSize;
  root.style.setProperty("--list-width", `${s.listWidth}px`);
}
