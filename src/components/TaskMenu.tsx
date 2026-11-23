import { useState } from "react";
import { useTaskStore } from "../store/store";
import { dueToYmd, ymdToDue } from "../lib/dates";
import { listKey } from "../lib/ids";
import PopoverMenu from "./PopoverMenu";
import type { TaskKey } from "../types";

export default function TaskMenu({ taskKey }: { taskKey: TaskKey }) {
  const task = useTaskStore((s) => s.tasks[taskKey]);
  const lists = useTaskStore((s) => s.lists);
  const writes = useTaskStore((s) => s.writesEnabled);
  const updateTask = useTaskStore((s) => s.updateTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const moveTask = useTaskStore((s) => s.moveTask);
  const [panel, setPanel] = useState<"notes" | "move" | null>(null);
  if (!task) return null;
  const targets = Object.values(lists).filter((l) => l.accountId === task.accountId && l.id !== task.listId);

  return (
    <PopoverMenu ariaLabel="Task menu">
      {(close) => (
        <>
          <button type="button" disabled={!writes} onClick={() => setPanel(panel === "notes" ? null : "notes")}>
            Edit notes
          </button>
          {panel === "notes" && (
            <textarea
              aria-label="Notes"
              rows={4}
              defaultValue={task.notes ?? ""}
              disabled={!writes}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== (task.notes ?? "")) void updateTask(taskKey, { notes: v === "" ? null : v });
              }}
            />
          )}
          <div className="menu-field">
            <label>
              Due date
              <input
                type="date"
                disabled={!writes}
                defaultValue={task.due ? dueToYmd(task.due) : ""}
                onChange={(e) => {
                  if (!e.target.value) return;
                  void updateTask(taskKey, { due: ymdToDue(e.target.value) });
                  close();
                }}
              />
            </label>
            <button
              type="button"
              disabled={!writes}
              onClick={() => {
                void updateTask(taskKey, { due: null });
                close();
              }}
            >
              Clear
            </button>
          </div>
          <button type="button" disabled={!writes || targets.length === 0} onClick={() => setPanel(panel === "move" ? null : "move")}>
            Move to list…
          </button>
          {panel === "move" &&
            targets.map((l) => (
              <button
                key={l.id}
                type="button"
               
                className="sub"
                disabled={!writes}
                onClick={() => {
                  void moveTask(taskKey, { listKey: listKey(l.accountId, l.id), previousTaskId: null });
                  close();
                }}
              >
                {l.title}
              </button>
            ))}
          <button
            type="button"
           
            className="danger"
            disabled={!writes}
            onClick={() => {
              if (!window.confirm(`Delete "${task.title}"?`)) return;
              void deleteTask(taskKey);
              close();
            }}
          >
            Delete
          </button>
        </>
      )}
    </PopoverMenu>
  );
}
