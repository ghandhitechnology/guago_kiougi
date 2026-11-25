import { finePointer } from "./focus.ts";

/**
 * Phones slide their keyboard over the bottom of the page. While a text field has focus there,
 * the game keeps its scale and the whole page is lifted just enough to keep the field in view.
 */
let lift = 0;
let field: HTMLInputElement | undefined;
let settle: number | undefined;

/** True while a field is being typed into on a touch screen: the page must not rescale. */
export function typingOnPhone(): boolean {
  return field !== undefined && document.activeElement === field;
}

function root(): HTMLElement | null {
  return document.getElementById("game");
}

function place(): void {
  const vv = window.visualViewport;
  const el = root();
  if (!field || !vv || !el) return;
  const r = field.getBoundingClientRect();
  const visibleBottom = vv.offsetTop + vv.height;
  lift = Math.max(0, Math.round(r.bottom + lift + 10 - visibleBottom));
  el.style.transform = lift ? `translateY(${-lift}px)` : "";
}

export function fieldFocused(input: HTMLInputElement): void {
  if (finePointer()) return;
  field = input;
  window.clearTimeout(settle);
  // The keyboard animates in; measure once it has settled, and again on every change.
  settle = window.setTimeout(place, 320);
}

export function fieldBlurred(input: HTMLInputElement): void {
  if (field !== input) return;
  window.setTimeout(() => {
    if (document.activeElement === field) return;
    field = undefined;
    lift = 0;
    const el = root();
    if (el) el.style.transform = "";
  }, 60);
}

window.visualViewport?.addEventListener("resize", place);
