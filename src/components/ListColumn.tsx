import { useMemo } from "react";
import { useTaskStore } from "../store/store";
import { buildTree, splitCompleted, tasksOfList } from "../sync/merge";
import { isMergedKey, parseListKey } from "../lib/ids";
import AddTaskInput from "./AddTaskInput";
import CompletedSection from "./CompletedSection";
import TaskItem from "./TaskItem";
import type { Group } from "../types";

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

  return (
    <div className="list-column" data-slot={group.key}>
      <header className="list-header">
        <span className="list-title">{group.title}</span>
        {headerAccounts.map((id) => (
          <span key={id} className="dot" style={{ background: colorOf(id) }} />
        ))}
        <button type="button" className="icon-btn" aria-label="List menu">⋯</button>
      </header>
      <div className="list-body">
        <AddTaskInput slotKey={group.key} />
        {members.map((m, i) => {
          const dot = merged ? colorOf(m.accountId) : undefined;
          return (
            <div key={m.key} className={`member${i > 0 ? " divided" : ""}`}>
              <ul>
                {m.tree.flatMap(({ task, children }) => [
                  <TaskItem key={task.id} task={task} depth={0} dotColor={dot} />,
                  ...children.map((c) => <TaskItem key={c.id} task={c} depth={1} dotColor={dot} />),
                ])}
              </ul>
            </div>
          );
        })}
        {showCompleted && done.length > 0 && <CompletedSection done={done} colorOf={merged ? colorOf : undefined} />}
      </div>
    </div>
  );
}
