import { useEffect, useState } from "react";
import { useStore } from "zustand";
import type { TaskStore } from "../store/store";
import "../styles/signin.css";

const DISMISS_MS = 4000;

/** The store has no dismiss action, so each toast hides itself locally after 4 s. */
function ToastItem({ text }: { text: string }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), DISMISS_MS);
    return () => clearTimeout(t);
  }, []);
  return visible ? <div className="toast" role="status">{text}</div> : null;
}

export default function Toast({ store }: { store: TaskStore }) {
  const toasts = useStore(store, (s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <ToastItem key={t.id} text={t.text} />
      ))}
    </div>
  );
}
