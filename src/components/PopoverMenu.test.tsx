import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PopoverMenu from "./PopoverMenu";

describe("PopoverMenu", () => {
  it("pointerdown inside the open menu does not reach a drag activator ancestor", () => {
    const spy = vi.fn();
    render(
      <div onPointerDown={spy}>
        <PopoverMenu ariaLabel="M">{() => <input aria-label="inner" />}</PopoverMenu>
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "M" }));
    fireEvent.pointerDown(screen.getByLabelText("inner"));
    expect(spy).not.toHaveBeenCalled();
  });

  it("calls onClose on Escape and outside press", () => {
    const onClose = vi.fn();
    render(<PopoverMenu ariaLabel="M" onClose={onClose}>{() => <span>x</span>}</PopoverMenu>);
    fireEvent.click(screen.getByRole("button", { name: "M" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "M" }));
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
