import { useRef, useState } from "react";

export default function InlineTitle({ value, onSave }: { value: string; onSave: (title: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const done = useRef(false); // Escape/Enter already settled this edit; ignore the blur that follows

  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    setEditing(false);
    const t = draft.trim();
    if (save && t && t !== value) onSave(t);
  };

  if (!editing) {
    return (
      <span
        className="title"
        onClick={() => {
          done.current = false;
          setDraft(value);
          setEditing(true);
        }}
      >
        {value}
      </span>
    );
  }
  return (
    <input
      className="title-input"
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(true);
        else if (e.key === "Escape") finish(false);
      }}
      onBlur={() => finish(true)}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}
