import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import InlineTitle from "./InlineTitle";

const edit = (value = "old") => {
  const onSave = vi.fn();
  render(<InlineTitle value={value} onSave={onSave} />);
  fireEvent.click(screen.getByText(value));
  return { onSave, input: screen.getByRole("textbox") as HTMLInputElement };
};

describe("InlineTitle", () => {
  it("Enter saves the trimmed new value", () => {
    const { onSave, input } = edit();
    expect(input.value).toBe("old");
    fireEvent.change(input, { target: { value: "  new " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSave).toHaveBeenCalledWith("new");
  });

  it("Escape cancels without saving and restores the text", () => {
    const { onSave, input } = edit();
    fireEvent.change(input, { target: { value: "new" } });
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.blur(input);
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("old")).toBeInTheDocument();
  });

  it("an empty title does not save", () => {
    const { onSave, input } = edit();
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("an unchanged title does not save; blur saves a changed one", () => {
    const a = edit();
    fireEvent.keyDown(a.input, { key: "Enter" });
    expect(a.onSave).not.toHaveBeenCalled();
  });

  it("blur saves like Enter", () => {
    const { onSave, input } = edit();
    fireEvent.change(input, { target: { value: "new" } });
    fireEvent.blur(input);
    expect(onSave).toHaveBeenCalledWith("new");
  });
});
