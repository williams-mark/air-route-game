import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as RKeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { inertOutside, modalStack, tabbables, trapIndex } from "./focusTrap";

interface ModalProps {
  /** Accessible name (aria-label). */
  label: string;
  /** Escape and a click on the backdrop call this (unless disabled below). */
  onClose: () => void;
  children: ReactNode;
  /** Class of the dialog box itself. */
  className?: string;
  /** Class of the backdrop wrapper (default "scrim"). */
  scrimClassName?: string;
  /** CSS selector of the control to focus first (inside the dialog); default is the first tabbable control. */
  initialFocus?: string;
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
}

/**
 * The one modal for the whole app (Save/Load, Orders/Fleet/Planner cabin dialogs, command palette, shortcuts, start screen).
 * Renders into a portal on document.body, makes the rest of the page inert while open, keeps Tab and Shift+Tab inside the
 * dialog, closes on Escape / backdrop click, and returns focus to whatever opened it.
 */
export function Modal({ label, onClose, children, className = "dialog", scrimClassName = "scrim", initialFocus, closeOnEscape = true, closeOnBackdrop = true }: ModalProps) {
  const [host] = useState(() => { const d = document.createElement("div"); d.setAttribute("data-modal-host", ""); return d; });
  const dialog = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useLayoutEffect(() => { document.body.appendChild(host); return () => { host.remove(); }; }, [host]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const undoInert = inertOutside(host);
    modalStack.push(host);
    const box = dialog.current!;
    const first = (initialFocus ? box.querySelector<HTMLElement>(initialFocus) : null) ?? tabbables(box)[0] ?? box;
    first.focus();
    // Belt and braces for browsers without `inert`: focus that escapes the topmost modal is pulled back in.
    const onFocusIn = (e: FocusEvent) => {
      if (modalStack[modalStack.length - 1] !== host || host.contains(e.target as Node)) return;
      (tabbables(box)[0] ?? box).focus();
    };
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      const i = modalStack.lastIndexOf(host);
      if (i >= 0) modalStack.splice(i, 1);
      undoInert(); // before focusing the opener: inert elements cannot take focus
      if (opener && opener.isConnected) opener.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host]);

  const onKeyDown = (e: RKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" && closeOnEscape) { e.stopPropagation(); e.preventDefault(); closeRef.current(); return; }
    if (e.key !== "Tab") return;
    const box = dialog.current!;
    const items = tabbables(box);
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = trapIndex(items.length, at, e.shiftKey);
    if (next === null) return;
    e.preventDefault();
    (next < 0 ? box : items[next]!).focus();
  };

  return createPortal(
    <div className={scrimClassName} onMouseDown={(e) => { if (closeOnBackdrop && e.target === e.currentTarget) closeRef.current(); }}>
      <div ref={dialog} className={className} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} onKeyDown={onKeyDown}>
        {children}
      </div>
    </div>,
    host,
  );
}
