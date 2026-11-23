import { useTaskStore } from "../store/store";
import { dueState, formatDue, todayYmd } from "../lib/dates";
import { taskKey } from "../lib/ids";
import type { Task } from "../types";

export default function TaskItem({ task, depth, dotColor }: { task: Task; depth: number; dotColor?: string }) {
  const toggleComplete = useTaskStore((s) => s.toggleComplete);
  const key = taskKey(task.accountId, task.id);
  const pending = task.id.startsWith("tmp:");
  const done = task.status === "completed";
  const today = todayYmd();
  return (
    <li
      className={`task${done ? " done" : ""}`}
      data-task-key={key}
      data-depth={depth}
      data-pending={pending ? "true" : undefined}
      style={{ "--depth": depth } as React.CSSProperties}
    >
      <input
        type="checkbox"
        checked={done}
        disabled={pending}
        aria-label={task.title}
        onChange={() => void toggleComplete(key)}
      />
      {dotColor && <span className="dot" style={{ background: dotColor }} />}
      <span className="title">{task.title}</span>
      {task.due && !done && (
        <span className="due" data-due={dueState(task.due, today)}>
          {formatDue(task.due, today)}
        </span>
      )}
    </li>
  );
}
