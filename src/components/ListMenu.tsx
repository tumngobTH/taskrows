import { useTaskStore } from "../store/store";
import { targetAccount } from "../layout/layout";
import { isMergedKey } from "../lib/ids";
import PopoverMenu from "./PopoverMenu";
import type { Group } from "../types";

export default function ListMenu({ group }: { group: Group }) {
  const accounts = useTaskStore((s) => s.accounts);
  const layout = useTaskStore((s) => s.layout);
  const setNewTaskTarget = useTaskStore((s) => s.setNewTaskTarget);
  const merged = isMergedKey(group.key);
  const ids = [...new Set(group.accountIds)];
  const current = targetAccount(layout, group);

  return (
    <PopoverMenu ariaLabel="List menu">
      {() =>
        merged ? (
          <fieldset className="menu-radios">
            <legend>New tasks go to</legend>
            {ids.map((id) => (
              <label key={id}>
                <input
                  type="radio"
                  name={`target-${group.key}`}
                  checked={current === id}
                  onChange={() => setNewTaskTarget(group.key, id)}
                />
                {accounts.find((a) => a.id === id)?.email ?? id}
              </label>
            ))}
          </fieldset>
        ) : (
          <span className="menu-note">No options for this list</span>
        )
      }
    </PopoverMenu>
  );
}
