import { useState } from "react";
import { useTaskStore } from "../store/store";
import type { SlotKey } from "../types";

export default function AddTaskInput({ slotKey }: { slotKey: SlotKey }) {
  const addTask = useTaskStore((s) => s.addTask);
  const writesEnabled = useTaskStore((s) => s.writesEnabled);
  const [text, setText] = useState("");
  return (
    <input
      className="add-task"
      placeholder="Add a task"
      value={text}
      disabled={!writesEnabled}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
        const t = text.trim();
        if (!t) return;
        setText("");
        void addTask(slotKey, t);
      }}
    />
  );
}
