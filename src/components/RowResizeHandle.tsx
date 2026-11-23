import { useRef } from "react";
import { getAppStore } from "../store/store";
import { resizeFractions } from "../dnd/resize";

type Drag = { pointerId: number; startY: number; height: number; start: number[]; current: number[]; index: number };

/** Horizontal grab bar between two adjacent rows; dragging it trades height between them. */
export default function RowResizeHandle({ aboveRowId, belowRowId }: { aboveRowId: string; belowRowId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  // Live preview straight on the two row sections; the store is written once, on release.
  const preview = (fractions: number[], index: number) => {
    const container = ref.current?.parentElement;
    if (!container) return;
    for (const [id, f] of [
      [aboveRowId, fractions[index]],
      [belowRowId, fractions[index + 1]],
    ] as const) {
      const el = container.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"]`);
      if (el) el.style.flex = `${f} 1 0`;
    }
  };

  const end = (commit: boolean) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (ref.current?.hasPointerCapture(d.pointerId)) ref.current.releasePointerCapture(d.pointerId);
    // Hand the DOM back to React first, so a rejected/unchanged commit can't leave stale preview styles.
    preview(d.start, d.index);
    if (commit && d.current.some((f, i) => f !== d.start[i])) getAppStore().getState().setRowHeights(d.current);
  };

  return (
    <div
      ref={ref}
      className="row-resize"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize rows"
      onPointerDown={(e) => {
        const rows = getAppStore().getState().layout.rows;
        const index = rows.findIndex((r) => r.id === aboveRowId);
        const height = ref.current?.parentElement?.getBoundingClientRect().height ?? 0;
        if (index < 0 || rows[index + 1]?.id !== belowRowId || height <= 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        const start = rows.map((r) => r.heightFraction);
        drag.current = { pointerId: e.pointerId, startY: e.clientY, height, start, current: start, index };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || e.pointerId !== d.pointerId) return;
        d.current = resizeFractions(d.start, d.index, (e.clientY - d.startY) / d.height);
        preview(d.current, d.index);
      }}
      onPointerUp={() => end(true)}
      onPointerCancel={() => end(false)}
      onLostPointerCapture={() => end(true)}
    />
  );
}
