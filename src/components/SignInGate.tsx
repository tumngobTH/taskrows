import { useEffect, useState } from "react";
import { useStore } from "zustand";
import { getOauthClient } from "../lib/tauri";
import type { TaskStore } from "../store/store";
import type { SyncEngine } from "../sync/syncEngine";
import { addAccountFlow, errorText } from "./addAccount";
import OAuthClientForm from "./OAuthClientForm";
import "../styles/signin.css";

interface Props {
  store: TaskStore;
  engine: SyncEngine;
}

export default function SignInGate({ store, engine }: Props) {
  const accountCount = useStore(store, (s) => s.accounts.length);
  const [hasClient, setHasClient] = useState<boolean | null>(null);
  const [editingClient, setEditingClient] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const check = async () => {
    try {
      setHasClient((await getOauthClient()) !== null);
    } catch (e) {
      setHasClient(false);
      setError(errorText(e));
    }
  };

  useEffect(() => {
    void check();
  }, []);

  if (hasClient === null) return null;

  if (!hasClient || editingClient) {
    return (
      <OAuthClientForm
        className="gate"
        heading={<h1>Connect to Google</h1>}
        footer={
          <>
            {error && <p className="error">{error}</p>}
            <p>See docs/SETUP-GOOGLE.md for how to create these.</p>
          </>
        }
        onSaved={async () => {
          setEditingClient(false);
          await check();
        }}
        onCancel={hasClient ? () => setEditingClient(false) : undefined}
      />
    );
  }

  if (accountCount > 0) return null;

  const add = async () => {
    setError(null);
    setBusy(true);
    try {
      await addAccountFlow(store, engine);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="gate">
      <h1>Add your Google account to get started</h1>
      <button onClick={add} disabled={busy}>
        Add Google account
      </button>
      {error && <p className="error">{error}</p>}
      <button type="button" className="link" onClick={() => setEditingClient(true)} disabled={busy}>
        Change OAuth client…
      </button>
    </div>
  );
}
