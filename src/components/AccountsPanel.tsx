import { useState } from "react";
import { useStore } from "zustand";
import type { TaskStore } from "../store/store";
import type { SyncEngine } from "../sync/syncEngine";
import { addAccountFlow, errorText } from "./addAccount";
import "../styles/signin.css";

const MAX_ACCOUNTS = 3;

export default function AccountsPanel({ store, engine }: { store: TaskStore; engine: SyncEngine }) {
  const accounts = useStore(store, (s) => s.accounts);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setError(null);
    try {
      await addAccountFlow(store, engine);
    } catch (e) {
      setError(errorText(e));
    }
  };
  const remove = (id: string, email: string) => {
    if (window.confirm(`Remove ${email}?`)) void store.getState().removeAccount(id);
  };

  return (
    <div className="accounts">
      {accounts.map((a) => (
        <div className="row" key={a.id}>
          <span className="dot" style={{ background: a.color }} />
          <span className="email">{a.email}</span>
          {a.needsReauth && <button onClick={run}>Sign in again</button>}
          <button onClick={() => remove(a.id, a.email)}>Remove</button>
        </div>
      ))}
      <button onClick={run} disabled={accounts.length >= MAX_ACCOUNTS}>
        Add account
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
