import { useEffect, useState } from "react";

/** Number field that commits a clamped value on every valid edit and normalises its text on blur. */
export default function NumberSetting({
  label,
  value,
  min,
  max,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max?: number;
  onCommit: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min, Math.round(n)));
  return (
    <label className="setting">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = e.target.valueAsNumber;
          if (Number.isFinite(n)) onCommit(clamp(n));
        }}
        onBlur={() => setDraft(String(value))}
      />
    </label>
  );
}
