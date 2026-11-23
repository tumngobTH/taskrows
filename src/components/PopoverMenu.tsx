import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "../styles/menus.css";

/**
 * A button that opens a small fixed-position menu (portalled so row/column overflow and
 * drag transforms cannot clip or offset it). Closes on Escape and on outside press.
 */
export default function PopoverMenu({
  ariaLabel,
  glyph = "⋯",
  className = "icon-btn",
  children,
}: {
  ariaLabel: string;
  glyph?: string;
  className?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const open = pos !== null;
  const close = () => setPos(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPos(null);
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setPos(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const toggle = () => {
    if (open) return close();
    const r = btnRef.current?.getBoundingClientRect();
    setPos({ top: (r?.bottom ?? 0) + 2, right: Math.max(4, window.innerWidth - (r?.right ?? 0)) });
  };

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        className={className}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onPointerDown={(e) => e.stopPropagation()} // the header/row is a drag activator
        onClick={toggle}
      >
        {glyph}
      </button>
      {open &&
        createPortal(
          <div ref={menuRef} role="dialog" aria-label={ariaLabel} className="popover-menu" style={{ top: pos.top, right: pos.right }}>
            {children(close)}
          </div>,
          document.body,
        )}
    </>
  );
}
