import { useEffect, useState } from "react";

/**
 * Number field. The text stays local while editing; a clamped value is committed on blur / Enter,
 * or immediately when an edit (e.g. a spinner step) is already within [min, max].
 */
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
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min, Math.round(n)));
  const finish = () => {
    const n = Number(draft);
    const v = draft.trim() !== "" && Number.isFinite(n) ? clamp(n) : value;
    setEditing(false);
    setDraft(String(v));
    if (v !== value) onCommit(v);
  };
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
          setEditing(true);
          const n = e.target.valueAsNumber;
          if (Number.isFinite(n) && n >= min && n <= (max ?? Infinity) && Number.isInteger(n)) onCommit(n);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") finish();
        }}
        onBlur={finish}
      />
    </label>
  );
}
