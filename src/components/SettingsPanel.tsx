import { useEffect, useState } from "react";
import { useStore } from "zustand";
import { getOauthClient } from "../lib/tauri";
import { ACCOUNT_COLORS, type TaskStore } from "../store/store";
import type { SyncEngine } from "../sync/syncEngine";
import type { Settings } from "../types";
import AccountsPanel from "./AccountsPanel";
import NumberSetting from "./NumberSetting";
import OAuthClientForm from "./OAuthClientForm";
import { errorText } from "./addAccount";

/** Shows the stored client ID (never the secret) and lets the user replace the client. */
function OAuthClientSection() {
  const [clientId, setClientId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    try {
      setClientId((await getOauthClient()) ?? null);
    } catch (e) {
      setError(errorText(e));
    }
  };
  useEffect(() => {
    void load();
  }, []);
  return (
    <section>
      <h3>OAuth client</h3>
      <p className="setting">
        Client ID: <code>{clientId ?? "not set"}</code>
      </p>
      {error && <p className="error">{error}</p>}
      {editing ? (
        <OAuthClientForm
          className="setting oauth-form"
          onSaved={async () => {
            setEditing(false);
            await load();
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <button type="button" onClick={() => setEditing(true)}>
          Change
        </button>
      )}
    </section>
  );
}

function Radios<K extends keyof Settings>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: K;
  value: Settings[K];
  options: { value: Settings[K]; label: string }[];
  onChange: (v: Settings[K]) => void;
}) {
  return (
    <fieldset className="setting radios">
      <legend>{legend}</legend>
      {options.map((o) => (
        <label key={String(o.value)}>
          <input type="radio" name={name} checked={value === o.value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}

export default function SettingsPanel({ store, engine, onClose }: { store: TaskStore; engine: SyncEngine; onClose: () => void }) {
  const settings = useStore(store, (s) => s.settings);
  const accounts = useStore(store, (s) => s.accounts);
  const set = (patch: Partial<Settings>) => store.getState().updateSettings(patch);
  const check = (label: string, key: "mergeSameName" | "showCompleted" | "alwaysOnTop" | "launchAtLogin") => (
    <label className="setting check">
      <input type="checkbox" checked={settings[key]} onChange={(e) => set({ [key]: e.target.checked })} />
      {label}
    </label>
  );

  return (
    <aside className="settings-panel" aria-label="Settings">
      <header>
        <h2>Settings</h2>
        <button type="button" className="icon-btn" aria-label="Close settings" onClick={onClose}>
          ✕
        </button>
      </header>

      <section>
        <h3>Accounts</h3>
        <AccountsPanel store={store} engine={engine} />
        {accounts.map((a) => (
          <div className="swatches" key={a.id}>
            <span className="email">{a.email}</span>
            {ACCOUNT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch${a.color === c ? " on" : ""}`}
                style={{ background: c }}
                aria-label={`Set ${a.email} colour to ${c}`}
                aria-pressed={a.color === c}
                onClick={() => store.getState().setAccountColor(a.id, c)}
              />
            ))}
          </div>
        ))}
      </section>

      <OAuthClientSection />

      <section>
        <h3>Board</h3>
        {check("Merge same-name lists", "mergeSameName")}
        {check("Show completed", "showCompleted")}
        <NumberSetting label="List width (px)" value={settings.listWidth} min={200} max={600} onCommit={(n) => set({ listWidth: n })} />
        <Radios
          legend="Font size"
          name="fontSize"
          value={settings.fontSize}
          options={[
            { value: "S", label: "Small" },
            { value: "M", label: "Medium" },
            { value: "L", label: "Large" },
          ]}
          onChange={(v) => set({ fontSize: v })}
        />
        <Radios
          legend="Theme"
          name="theme"
          value={settings.theme}
          options={[
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
          onChange={(v) => set({ theme: v })}
        />
      </section>

      <section>
        <h3>Sync &amp; window</h3>
        <NumberSetting label="Poll interval (seconds)" value={settings.pollIntervalSec} min={15} onCommit={(n) => set({ pollIntervalSec: n })} />
        {check("Always on top", "alwaysOnTop")}
        {check("Launch at login", "launchAtLogin")}
      </section>
    </aside>
  );
}
