import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import NumberSetting from "./NumberSetting";

function Host({ onCommit, start = 300, min = 200, max = 600 }: { onCommit: (n: number) => void; start?: number; min?: number; max?: number }) {
  const [v, setV] = useState(start);
  return <NumberSetting label="W" value={v} min={min} max={max} onCommit={(n) => { setV(n); onCommit(n); }} />;
}

describe("NumberSetting", () => {
  it("lets a value be typed digit by digit and commits on blur", () => {
    const onCommit = vi.fn();
    render(<Host onCommit={onCommit} />);
    const f = screen.getByLabelText("W") as HTMLInputElement;
    for (const t of ["4", "40", "400"]) {
      fireEvent.change(f, { target: { value: t } });
      expect(f.value).toBe(t);
    }
    expect(onCommit).not.toHaveBeenCalledWith(200); // intermediate values are never clamped into the store
    fireEvent.blur(f);
    expect(onCommit).toHaveBeenLastCalledWith(400);
    expect(f.value).toBe("400");
  });

  it("clamps up on blur and on Enter", () => {
    const onCommit = vi.fn();
    render(<Host onCommit={onCommit} start={60} min={15} max={undefined as unknown as number} />);
    const f = screen.getByLabelText("W") as HTMLInputElement;
    fireEvent.change(f, { target: { value: "5" } });
    fireEvent.keyDown(f, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith(15);
    expect(f.value).toBe("15");
  });

  it("an empty field reverts on blur", () => {
    const onCommit = vi.fn();
    render(<Host onCommit={onCommit} />);
    const f = screen.getByLabelText("W") as HTMLInputElement;
    fireEvent.change(f, { target: { value: "" } });
    fireEvent.blur(f);
    expect(onCommit).not.toHaveBeenCalled();
    expect(f.value).toBe("300");
  });
});
