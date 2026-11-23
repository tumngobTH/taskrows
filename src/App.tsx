import { useState } from "react";
import { useStore } from "zustand";
import Board from "./components/Board";
import Footer from "./components/Footer";
import SettingsPanel from "./components/SettingsPanel";
import SignInGate from "./components/SignInGate";
import Toast from "./components/Toast";
import type { TaskStore } from "./store/store";
import type { SyncEngine } from "./sync/syncEngine";

export default function App({ store, engine }: { store: TaskStore; engine: SyncEngine }) {
  const accountCount = useStore(store, (s) => s.accounts.length);
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <div className="app">
      {accountCount === 0 ? <SignInGate store={store} engine={engine} /> : <Board />}
      {/* Settings stay reachable from the sign-in gate (e.g. to fix the OAuth client). */}
      {settingsOpen && <SettingsPanel store={store} engine={engine} onClose={() => setSettingsOpen(false)} />}
      <Footer engine={engine} onSettings={() => setSettingsOpen((o) => !o)} />
      <Toast store={store} />
    </div>
  );
}
