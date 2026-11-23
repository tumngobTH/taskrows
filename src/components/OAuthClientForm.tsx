import { useState, type ReactNode } from "react";
import { setOauthClient } from "../lib/tauri";
import { errorText } from "./addAccount";

interface Props {
  className?: string;
  heading?: ReactNode;
  footer?: ReactNode;
  onSaved: () => void | Promise<void>;
  onCancel?: () => void;
}

/** Client ID + secret entry. Saving overwrites any stored client (set_oauth_client). */
export default function OAuthClientForm({ className, heading, footer, onSaved, onCancel }: Props) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await setOauthClient(clientId.trim(), clientSecret.trim());
      await onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={className} onSubmit={save}>
      {heading}
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
      {onCancel && (
        <button type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      )}
      {error && <p className="error">{error}</p>}
      {footer}
    </form>
  );
}
