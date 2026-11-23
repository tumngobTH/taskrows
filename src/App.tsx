import { useStore } from "zustand";
import AccountsPanel from "./components/AccountsPanel";
import SignInGate from "./components/SignInGate";
import Toast from "./components/Toast";
import type { TaskStore } from "./store/store";
import type { SyncEngine } from "./sync/syncEngine";

export default function App({ store, engine }: { store: TaskStore; engine: SyncEngine }) {
  const accountCount = useStore(store, (s) => s.accounts.length);
  const groups = useStore(store, (s) => s.groups);
  return (
    <>
      {accountCount === 0 ? (
        <SignInGate store={store} engine={engine} />
      ) : (
        <div>
          {/* temporary until Task 10 */}
          <ul>
            {groups.map((g) => (
              <li key={g.key}>{g.title}</li>
            ))}
          </ul>
          <AccountsPanel store={store} engine={engine} />
        </div>
      )}
      <Toast store={store} />
    </>
  );
}
