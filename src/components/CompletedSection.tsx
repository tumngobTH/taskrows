import { useState } from "react";
import TaskItem from "./TaskItem";
import type { Task } from "../types";

export default function CompletedSection({ done, colorOf }: { done: Task[]; colorOf?: (accountId: string) => string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="completed">
      <button type="button" className="completed-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        Completed ({done.length})
      </button>
      {open && (
        <ul>
          {done.map((t) => (
            <TaskItem key={t.id} task={t} depth={t.parent ? 1 : 0} dotColor={colorOf?.(t.accountId)} />
          ))}
        </ul>
      )}
    </div>
  );
}
