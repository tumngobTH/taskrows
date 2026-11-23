import { useState } from "react";
import { useStore } from "zustand";
import AccountsPanel from "./components/AccountsPanel";
import Board from "./components/Board";
import Footer from "./components/Footer";
import SignInGate from "./components/SignInGate";
import Toast from "./components/Toast";
import type { TaskStore } from "./store/store";
import type { SyncEngine } from "./sync/syncEngine";

export default function App({ store, engine }: { store: TaskStore; engine: SyncEngine }) {
  const accountCount = useStore(store, (s) => s.accounts.length);
  const [settingsOpen, setSettingsOpen] = useState(false); // Task 12 renders the panel
  return (
    <div className="app">
      {accountCount === 0 ? (
        <SignInGate store={store} engine={engine} />
      ) : (
        <>
          <Board />
          {settingsOpen && <AccountsPanel store={store} engine={engine} />}
          <Footer engine={engine} onSettings={() => setSettingsOpen((o) => !o)} />
        </>
      )}
      <Toast store={store} />
    </div>
  );
}
