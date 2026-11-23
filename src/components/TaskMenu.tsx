import { useRef, useState } from "react";
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
  const notesDraft = useRef<string | null>(null); // unsaved textarea content
  const [dateDraft, setDateDraft] = useState<string | null>(null);
  const savedDue = useRef<string | null>(task?.due ?? null);
  if (!task) return null;
  const flushNotes = () => {
    const d = notesDraft.current;
    notesDraft.current = null;
    if (d === null) return;
    const v = d.trim();
    if (v !== (task.notes ?? "").trim()) void updateTask(taskKey, { notes: v === "" ? null : v });
  };
  const saveDate = (ymd: string) => {
    const year = Number(ymd.slice(0, 4));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || year < 2000 || year > 2100) return;
    const due = ymdToDue(ymd);
    if (due === savedDue.current) return;
    savedDue.current = due;
    void updateTask(taskKey, { due });
  };
  const targets = Object.values(lists).filter((l) => l.accountId === task.accountId && l.id !== task.listId);

  return (
    <PopoverMenu ariaLabel="Task menu" onClose={flushNotes}>
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
              onChange={(e) => (notesDraft.current = e.target.value)}
              onBlur={flushNotes}
            />
          )}
          <div className="menu-field">
            <label>
              Due date
              <input
                type="date"
                disabled={!writes}
                value={dateDraft ?? (task.due ? dueToYmd(task.due) : "")}
                onChange={(e) => {
                  setDateDraft(e.target.value);
                  if (e.target.value.length === 10) saveDate(e.target.value);
                }}
                onBlur={(e) => saveDate(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveDate((e.target as HTMLInputElement).value);
                }}
              />
            </label>
            <button
              type="button"
              disabled={!writes}
              onClick={() => {
                savedDue.current = null;
                setDateDraft("");
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
