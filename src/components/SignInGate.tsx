import { useEffect, useState } from "react";
import { useStore } from "zustand";
import { getOauthClient, setOauthClient } from "../lib/tauri";
import type { TaskStore } from "../store/store";
import type { SyncEngine } from "../sync/syncEngine";
import { addAccountFlow, errorText } from "./addAccount";
import "../styles/signin.css";

interface Props {
  store: TaskStore;
  engine: SyncEngine;
}

export default function SignInGate({ store, engine }: Props) {
  const accountCount = useStore(store, (s) => s.accounts.length);
  const [hasClient, setHasClient] = useState<boolean | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
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

  if (!hasClient) {
    const save = async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setBusy(true);
      try {
        await setOauthClient(clientId.trim(), clientSecret.trim());
        await check();
      } catch (err) {
        setError(errorText(err));
      } finally {
        setBusy(false);
      }
    };
    return (
      <form className="gate" onSubmit={save}>
        <h1>Connect to Google</h1>
        <label>
          Client ID
          <input value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" />
        </label>
        <label>
          Client secret
          <input value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} type="password" autoComplete="off" />
        </label>
        <button type="submit" disabled={busy || !clientId.trim() || !clientSecret.trim()}>
          Save
        </button>
        {error && <p className="error">{error}</p>}
        <p>See docs/SETUP-GOOGLE.md for how to create these.</p>
      </form>
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
    </div>
  );
}
