import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTaskStore } from "../store/store";
import { dueState, formatDue, todayYmd } from "../lib/dates";
import { listKey, taskKey } from "../lib/ids";
import { taskDndId, type DndData } from "../dnd/BoardDnd";
import type { Task } from "../types";

export default function TaskItem({ task, depth, dotColor }: { task: Task; depth: number; dotColor?: string }) {
  const toggleComplete = useTaskStore((s) => s.toggleComplete);
  const key = taskKey(task.accountId, task.id);
  const pending = task.id.startsWith("tmp:");
  const done = task.status === "completed";
  const today = todayYmd();
  // Completed and not-yet-synced tasks are neither draggable nor drop targets.
  const dragOff = done || pending;
  const data: DndData = {
    type: "task",
    taskKey: key,
    listKey: listKey(task.accountId, task.listId),
    parentId: depth > 0 ? (task.parent ?? null) : null,
  };
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: taskDndId(key),
    data,
    disabled: dragOff,
  });
  return (
    <li
      ref={setNodeRef}
      {...(dragOff ? {} : { ...attributes, ...listeners })}
      className={`task${done ? " done" : ""}${isDragging ? " dragging" : ""}`}
      data-task-key={key}
      data-depth={depth}
      data-pending={pending ? "true" : undefined}
      style={{ "--depth": depth, transform: CSS.Translate.toString(transform), transition } as React.CSSProperties}
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
