import { Fragment, useContext, useMemo, type ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTaskStore } from "../store/store";
import { buildTree, splitCompleted, tasksOfList } from "../sync/merge";
import { isMergedKey, parseListKey, taskKey } from "../lib/ids";
import { RowIdContext, columnDndId, memberDndId, slotDndId, taskDndId, type DndData } from "../dnd/BoardDnd";
import AddTaskInput from "./AddTaskInput";
import CompletedSection from "./CompletedSection";
import TaskItem from "./TaskItem";
import type { Group, ListKey, Task } from "../types";

/** Sortable ids of the draggable (synced) tasks, in render order. */
const dndIds = (ts: Task[]) => ts.filter((t) => !t.id.startsWith("tmp:")).map((t) => taskDndId(taskKey(t.accountId, t.id)));

function MemberDrop({ listKey, className, children }: { listKey: ListKey; className: string; children: ReactNode }) {
  const data: DndData = { type: "member", listKey };
  const { setNodeRef } = useDroppable({ id: memberDndId(listKey), data });
  return (
    <div ref={setNodeRef} className={className}>
      {children}
    </div>
  );
}

export default function ListColumn({ group }: { group: Group }) {
  const tasks = useTaskStore((s) => s.tasks);
  const accounts = useTaskStore((s) => s.accounts);
  const showCompleted = useTaskStore((s) => s.settings.showCompleted);
  const merged = isMergedKey(group.key);
  const colorOf = (accountId: string) => accounts.find((a) => a.id === accountId)?.color ?? "#888";
  const headerAccounts = [...new Set(group.accountIds)];

  const members = useMemo(
    () =>
      group.members.map((m) => {
        const { open, done } = splitCompleted(tasksOfList(tasks, m).filter((t) => !t.deleted));
        return { key: m, accountId: parseListKey(m).accountId, tree: buildTree(open), done };
      }),
    [group.members, tasks],
  );

  const done = members.flatMap((m) => m.done);

  const rowId = useContext(RowIdContext);
  const slotData: DndData = { type: "slot", slotKey: group.key, rowId: rowId ?? "" };
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: slotDndId(group.key),
    data: slotData,
  });
  const columnData: DndData = { type: "column", slotKey: group.key };
  const { setNodeRef: setBodyRef } = useDroppable({ id: columnDndId(group.key), data: columnData });

  return (
    <div
      ref={setNodeRef}
      className={`list-column${isDragging ? " dragging" : ""}`}
      data-slot={group.key}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <header className="list-header" ref={setActivatorNodeRef} {...attributes} {...listeners}>
        <span className="list-title">{group.title}</span>
        {headerAccounts.map((id) => (
          <span key={id} className="dot" style={{ background: colorOf(id) }} />
        ))}
        <button type="button" className="icon-btn" aria-label="List menu">⋯</button>
      </header>
      <div className="list-body" ref={setBodyRef}>
        <AddTaskInput slotKey={group.key} />
        {members.map((m, i) => {
          const dot = merged ? colorOf(m.accountId) : undefined;
          return (
            <MemberDrop key={m.key} listKey={m.key} className={`member${i > 0 ? " divided" : ""}`}>
              <ul>
                <SortableContext items={dndIds(m.tree.map((n) => n.task))} strategy={verticalListSortingStrategy}>
                  {m.tree.map(({ task, children }) => (
                    <Fragment key={task.id}>
                      <TaskItem task={task} depth={0} dotColor={dot} />
                      <SortableContext items={dndIds(children)} strategy={verticalListSortingStrategy}>
                        {children.map((c) => (
                          <TaskItem key={c.id} task={c} depth={1} dotColor={dot} />
                        ))}
                      </SortableContext>
                    </Fragment>
                  ))}
                </SortableContext>
              </ul>
            </MemberDrop>
          );
        })}
        {showCompleted && done.length > 0 && <CompletedSection done={done} colorOf={merged ? colorOf : undefined} />}
      </div>
    </div>
  );
}
