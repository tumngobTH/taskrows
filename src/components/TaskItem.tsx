import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTaskStore } from "../store/store";
import { dueState, formatDue, todayYmd } from "../lib/dates";
import { listKey, taskKey } from "../lib/ids";
import { taskDndId, type DndData } from "../dnd/BoardDnd";
import InlineTitle from "./InlineTitle";
import TaskMenu from "./TaskMenu";
import type { Task } from "../types";

export default function TaskItem({ task, depth, dotColor }: { task: Task; depth: number; dotColor?: string }) {
  const toggleComplete = useTaskStore((s) => s.toggleComplete);
  const updateTask = useTaskStore((s) => s.updateTask);
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
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: taskDndId(key),
    data,
    disabled: dragOff,
  });
  // Pointer drag starts from anywhere on the row except interactive controls; keyboard drag stays on the grip.
  const onRowPointerDown = (e: React.PointerEvent<HTMLLIElement>) => {
    if ((e.target as HTMLElement).closest("input, textarea, button, select, [contenteditable]")) return;
    listeners?.onPointerDown?.(e);
  };
  return (
    <li
      ref={setNodeRef}
      className={`task${dragOff ? "" : " draggable"}${done ? " done" : ""}${isDragging ? " dragging" : ""}`}
      onPointerDown={dragOff ? undefined : onRowPointerDown}
      data-task-key={key}
      data-depth={depth}
      data-pending={pending ? "true" : undefined}
      style={{ "--depth": depth, transform: CSS.Translate.toString(transform), transition } as React.CSSProperties}
    >
      {/* Keyboard drag handle (only onKeyDown here): keeps Space/Enter on the checkbox a native toggle, not a keyboard drag. */}
      {dragOff ? (
        <span className="grip off" aria-hidden="true" />
      ) : (
        <span className="grip" ref={setActivatorNodeRef} {...attributes} onKeyDown={listeners?.onKeyDown as React.KeyboardEventHandler<HTMLSpanElement> | undefined} aria-label="Drag task">
          ⋮⋮
        </span>
      )}
      <input
        type="checkbox"
        checked={done}
        disabled={pending}
        aria-label={task.title}
        onChange={() => void toggleComplete(key)}
      />
      {dotColor && <span className="dot" style={{ background: dotColor }} />}
      {pending || done ? (
        <span className="title">{task.title}</span>
      ) : (
        <InlineTitle value={task.title} onSave={(t) => void updateTask(key, { title: t })} />
      )}
      {task.due && !done && (
        <span className="due" data-due={dueState(task.due, today)}>
          {formatDue(task.due, today)}
        </span>
      )}
      {!pending && <TaskMenu taskKey={key} />}
    </li>
  );
}
