/**
 * App-wide "Esc closes the topmost dialog / slideout".
 *
 * Overlays are detected from the DOM (a fixed, viewport-covering element that looks like an
 * overlay), and closed through their own close control so unsaved-change prompts and busy
 * states still apply. Components that handle Escape themselves must call
 * `event.preventDefault()` so this handler stays out of the way.
 *
 * Markup hooks:
 * - `data-esc-close` on a button: the control Esc should press for that overlay.
 * - `data-esc-ignore` on an overlay (or ancestor): never treat it as an Esc target.
 */

const OVERLAY_NAME_RE = /(overlay|backdrop|modal|dialog|slideout|drawer|popup)/i;

const CLOSE_CLASS_SELECTOR = [
  ".btn-close",
  ".slideout-close",
  ".close-button",
  ".close-btn",
  ".modal-close",
  ".jt-picker-close",
  ".conversation-panel-close",
  ".user-account-modal-close",
].join(",");

const CLOSE_LABEL_RE = /^close\b/i;
const CLOSE_GLYPHS = new Set(["×", "✕", "✖", "x", "X"]);
const CLOSE_ICON_SELECTOR =
  'svg[data-icon="xmark"], svg[data-icon="times"], svg[data-icon="x"], i.fa-times, i.fa-xmark';
const DISMISS_TEXT_RE = /^(close|cancel)$/i;

function isVisible(el: HTMLElement): boolean {
  if (el.getClientRects().length === 0) return false;
  const cs = window.getComputedStyle(el);
  return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) !== 0;
}

function hasDimmingBackground(cs: CSSStyleDeclaration): boolean {
  const backdropFilter =
    cs.backdropFilter || (cs as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter;
  if (backdropFilter && backdropFilter !== "none") return true;
  const match = cs.backgroundColor.match(/rgba?\(([^)]+)\)/i);
  if (!match) return false;
  const parts = match[1].split(/[,\s/]+/).filter(Boolean);
  if (parts.length < 4) return false;
  const alpha = parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
  return alpha > 0.05 && alpha < 1;
}

function looksLikeOverlay(el: HTMLElement): boolean {
  if (el === document.body || el === document.documentElement || el.id === "root") return false;
  if (el.closest("[data-esc-ignore]")) return false;

  const cs = window.getComputedStyle(el);
  if (cs.position !== "fixed") return false;

  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (rect.width < vw * 0.9 || rect.height < vh * 0.9) return false;

  const className = typeof el.className === "string" ? el.className : "";
  const role = el.getAttribute("role");
  return (
    OVERLAY_NAME_RE.test(className) ||
    role === "dialog" ||
    role === "presentation" ||
    el.getAttribute("aria-modal") === "true" ||
    el.parentElement === document.body ||
    hasDimmingBackground(cs)
  );
}

/** Topmost visible dialog/slideout overlay, honouring real paint order (z-index, portals). */
export function findTopmostOverlay(): HTMLElement | null {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const points: Array<[number, number]> = [
    [8, vh / 2],
    [vw - 8, vh / 2],
    [vw / 2, 8],
    [vw / 2, vh - 8],
  ];

  for (const [x, y] of points) {
    const stack = document.elementsFromPoint(x, y);
    for (const node of stack) {
      if (node instanceof HTMLElement && looksLikeOverlay(node)) return node;
    }
  }
  return null;
}

export function isAnyOverlayOpen(): boolean {
  return findTopmostOverlay() !== null;
}

function isDisabled(el: HTMLElement): boolean {
  return (
    (el as HTMLButtonElement).disabled === true ||
    el.getAttribute("aria-disabled") === "true"
  );
}

function findCloseControl(overlay: HTMLElement): HTMLElement | null {
  const controls = Array.from(
    overlay.querySelectorAll<HTMLElement>('button, [role="button"]')
  ).filter(isVisible);

  const byPriority: Array<(el: HTMLElement) => boolean> = [
    (el) => el.hasAttribute("data-esc-close"),
    (el) => el.matches(CLOSE_CLASS_SELECTOR),
    (el) =>
      CLOSE_LABEL_RE.test(el.getAttribute("aria-label") || "") ||
      CLOSE_LABEL_RE.test(el.getAttribute("title") || ""),
    (el) =>
      CLOSE_GLYPHS.has((el.textContent || "").trim()) ||
      (!(el.textContent || "").trim() && el.querySelector(CLOSE_ICON_SELECTOR) !== null),
    (el) => DISMISS_TEXT_RE.test((el.textContent || "").trim()),
  ];

  for (const matches of byPriority) {
    const hit = controls.find(matches);
    if (hit) return hit;
  }
  return null;
}

function dismissOverlay(overlay: HTMLElement): void {
  const control = findCloseControl(overlay);
  if (control) {
    if (!isDisabled(control)) control.click();
    return;
  }

  const backdrop = Array.from(overlay.children).find(
    (child): child is HTMLElement =>
      child instanceof HTMLElement &&
      typeof child.className === "string" &&
      /backdrop/i.test(child.className)
  );
  (backdrop ?? overlay).click();
}

/** Installs the global Escape handler; returns an uninstall function. */
export function installGlobalEscapeToClose(): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.repeat || event.isComposing) return;

    // Snapshot before other handlers run; act after them so a component that handled
    // Escape itself (preventDefault) or already closed this layer wins.
    const overlay = findTopmostOverlay();
    if (!overlay) return;

    window.setTimeout(() => {
      if (event.defaultPrevented) return;
      if (!overlay.isConnected || !isVisible(overlay)) return;
      dismissOverlay(overlay);
    }, 0);
  };

  window.addEventListener("keydown", onKeyDown, true);
  return () => window.removeEventListener("keydown", onKeyDown, true);
}
