import { useTaskStore } from "../store/store";
import type { SyncEngine } from "../sync/syncEngine";

export default function Footer({ engine, onSettings }: { engine: SyncEngine; onSettings: () => void }) {
  const sync = useTaskStore((s) => s.sync);
  let text = "Synced";
  if (sync.phase === "offline") text = "Offline";
  else if (sync.phase === "syncing") text = "Syncing…";
  else if (sync.phase === "error") text = `Error: ${sync.message ?? "unknown"}`;
  else if (sync.lastSyncAt) text = `Synced ${new Date(sync.lastSyncAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  return (
    <footer className="footer">
      <span className="sync-text">{text}</span>
      <button type="button" onClick={() => void engine.syncNow()}>
        Sync now
      </button>
      <button type="button" className="icon-btn" aria-label="Settings" onClick={onSettings}>
        ⚙
      </button>
    </footer>
  );
}
