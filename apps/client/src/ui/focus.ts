import { sound } from "./sound.ts";

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export type NavKey = "up" | "down" | "left" | "right" | "next" | "prev" | "enter" | "back";
export type FocusCause = "key" | "pointer";

/** Anything the keyboard can land on: a button, a field, a tab row, a list. */
export interface Focusable {
  /** Bounds on screen, in game pixels. */
  bounds(): Rect;
  enabled(): boolean;
  setFocus(on: boolean, cause: FocusCause): void;
  activate(): void;
  /** Keys the item uses itself (a tab row takes left and right). True when taken. */
  nav?(key: NavKey): boolean;
  /** A text field's DOM input: while it has the browser's focus, typing goes to it. */
  readonly field?: HTMLInputElement;
  /** Places the DOM input over the field and gives it the browser's focus. */
  focusField?(): void;
  /** Comes after everything else in Tab order, like a cover's close cross. */
  readonly late?: boolean;
}

/**
 * The focusable items of one screen or modal. Scopes stack: the top one gets the keyboard,
 * and while any scope is open the world below never sees a key.
 */
export class FocusScope {
  private readonly items: Focusable[] = [];
  current: Focusable | undefined;
  onBack: (() => void) | undefined;

  add(...items: Focusable[]): this {
    this.items.push(...items);
    return this;
  }

  remove(item: Focusable): void {
    const i = this.items.indexOf(item);
    if (i >= 0) this.items.splice(i, 1);
    if (this.current === item) this.current = undefined;
  }

  focus(item: Focusable | undefined, cause: FocusCause = "key"): void {
    if (item === this.current) {
      // A click on a field that already has focus still hands it the browser's focus.
      if (item?.field && document.activeElement !== item.field) item.focusField?.();
      return;
    }
    const was = this.current;
    this.current = item;
    was?.setFocus(false, cause);
    if (was?.field && document.activeElement === was.field) was.field.blur();
    if (!item) return;
    item.setFocus(true, cause);
    if (item.field && document.activeElement !== item.field) {
      if (cause === "key" || finePointer()) item.focusField?.();
    }
    if (was) sound("hover");
  }

  /** Drops the visual focus without moving it elsewhere, as when the pointer leaves. */
  blur(): void {
    this.focus(undefined, "pointer");
  }

  /** Items in Tab order: as added, with the late ones moved to the end. */
  private ordered(): Focusable[] {
    return [...this.items.filter((i) => !i.late), ...this.items.filter((i) => i.late)];
  }

  first(): Focusable | undefined {
    return this.ordered().find((i) => i.enabled());
  }

  handle(key: NavKey): boolean {
    const cur = this.current;
    if (cur?.nav?.(key)) return true;
    switch (key) {
      case "back":
        if (!this.onBack) return false;
        this.onBack();
        return true;
      case "enter":
        if (!cur) {
          this.focus(this.first());
          return true;
        }
        if (cur.enabled()) cur.activate();
        return true;
      case "next":
      case "prev":
        this.focus(this.step(key === "next" ? 1 : -1));
        return true;
      default:
        this.focus(cur ? (this.toward(key) ?? cur) : this.first());
        return true;
    }
  }

  private step(by: 1 | -1): Focusable | undefined {
    const live = this.ordered().filter((i) => i.enabled());
    if (live.length === 0) return undefined;
    const at = this.current ? live.indexOf(this.current) : -1;
    if (at < 0) return by === 1 ? live[0] : live.at(-1);
    return live[(at + by + live.length) % live.length];
  }

  /** The nearest enabled item in a direction, favouring ones in line with the current one. */
  private toward(key: "up" | "down" | "left" | "right"): Focusable | undefined {
    const from = this.current?.bounds();
    if (!from) return this.first();
    const fx = from.x + from.w / 2;
    const fy = from.y + from.h / 2;
    let best: Focusable | undefined;
    let score = Number.POSITIVE_INFINITY;
    for (const item of this.items) {
      if (item === this.current || !item.enabled()) continue;
      const b = item.bounds();
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const dx = cx - fx;
      const dy = cy - fy;
      const vertical = key === "up" || key === "down";
      const ahead = key === "up" ? -dy : key === "down" ? dy : key === "left" ? -dx : dx;
      if (ahead <= 1) continue;
      // Overlap along the other axis counts as in line.
      const side = vertical
        ? Math.max(0, Math.abs(dx) - (b.w + from.w) / 2)
        : Math.max(0, Math.abs(dy) - (b.h + from.h) / 2);
      const s = ahead + side * 3;
      if (s < score) {
        score = s;
        best = item;
      }
    }
    return best;
  }
}

const scopes: FocusScope[] = [];

export function pushScope(scope: FocusScope): void {
  popScope(scope);
  scopes.push(scope);
}

export function popScope(scope: FocusScope): void {
  const i = scopes.indexOf(scope);
  if (i >= 0) scopes.splice(i, 1);
  if (scope.current?.field && document.activeElement === scope.current.field) {
    scope.current.field.blur();
  }
}

/** True while a menu, modal or text field holds the keyboard; the world reads no keys then. */
export function uiHasKeyboard(): boolean {
  return scopes.length > 0;
}

export function finePointer(): boolean {
  return window.matchMedia?.("(pointer: fine)").matches ?? true;
}

function navKey(e: KeyboardEvent, typing: boolean): NavKey | undefined {
  switch (e.key) {
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    case "ArrowLeft":
      return typing ? undefined : "left";
    case "ArrowRight":
      return typing ? undefined : "right";
    case "Tab":
      return e.shiftKey ? "prev" : "next";
    case "Enter":
      return "enter";
    case " ":
      return typing ? undefined : "enter";
    case "Escape":
      return "back";
    default:
      return undefined;
  }
}

/**
 * Keys reach the UI before Phaser sees them: this listens on the window in the capture phase,
 * ahead of Phaser's own listener. A key the UI takes is stopped there, so the world scene
 * never moves while someone types a name.
 */
/**
 * Keys the game takes while no menu or field holds the keyboard: Enter opens chat, Escape the
 * notebook. True when taken.
 */
let idle: ((e: KeyboardEvent) => boolean) | undefined;

export function setIdleKeys(fn: ((e: KeyboardEvent) => boolean) | undefined): void {
  idle = fn;
}

function route(e: KeyboardEvent): void {
  const scope = scopes.at(-1);
  if (!scope) {
    if (!e.repeat && !e.isComposing && idle?.(e)) {
      e.preventDefault();
      e.stopPropagation();
    }
    return;
  }
  const field = scope.current?.field;
  const typing = field !== undefined && document.activeElement === field;
  // Mid-composition keys belong to the IME (Enter commits a syllable, it does not submit).
  if (e.isComposing || e.keyCode === 229) {
    e.stopPropagation();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) {
    if (typing) e.stopPropagation();
    return;
  }
  const key = navKey(e, typing);
  if (key && scope.handle(key)) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  e.stopPropagation();
}

window.addEventListener("keydown", route, true);
