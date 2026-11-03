// Pure and DOM helpers behind the shared Modal (shell/Modal.tsx). The index maths is unit-tested without a DOM.

/** Elements a keyboard user can reach with Tab. */
export const TABBABLE =
  'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex], [contenteditable="true"]';

/**
 * Where Tab / Shift+Tab should go inside a trapped dialog with `count` tabbable controls and focus currently on
 * `current` (-1 when focus is not on any of them). Returns the index to focus, or null to let the browser move
 * focus normally (it stays inside the dialog because we only intervene at the edges).
 */
export function trapIndex(count: number, current: number, shift: boolean): number | null {
  if (count <= 0) return -1; // nothing to focus: the caller keeps focus on the dialog itself
  if (current < 0) return shift ? count - 1 : 0;
  if (shift && current === 0) return count - 1;
  if (!shift && current === count - 1) return 0;
  return null;
}

/** Tabbable, visible, enabled descendants of `root` in DOM order (positive tabindex is not supported on purpose). */
export function tabbables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter((el) => {
    if (el.tabIndex < 0 || (el as HTMLButtonElement).disabled || el.closest("[inert]")) return false;
    if (el instanceof HTMLInputElement && el.type === "radio" && !el.checked && root.querySelector(`input[type="radio"][name="${el.name}"]:checked`)) return false;
    return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  });
}

/** Mark every other child of `body` inert (and aria-hidden) so nothing behind the modal can take focus or be read. Returns the undo. */
export function inertOutside(host: HTMLElement, body: HTMLElement = document.body): () => void {
  const changed: Array<{ el: Element; ariaHidden: string | null }> = [];
  for (const el of Array.from(body.children)) {
    if (el === host || el.hasAttribute("inert") || el.tagName === "SCRIPT") continue;
    changed.push({ el, ariaHidden: el.getAttribute("aria-hidden") });
    el.setAttribute("inert", "");
    el.setAttribute("aria-hidden", "true");
  }
  return () => {
    for (const { el, ariaHidden } of changed) {
      el.removeAttribute("inert");
      if (ariaHidden === null) el.removeAttribute("aria-hidden"); else el.setAttribute("aria-hidden", ariaHidden);
    }
  };
}

/** Open modals, topmost last; only the topmost one reacts to stray focus. */
export const modalStack: HTMLElement[] = [];
