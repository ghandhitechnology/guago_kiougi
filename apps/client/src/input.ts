import { MOVE_MAX } from "@guago/shared";

/** Physical keys, so WASD stays WASD under a Korean or any other layout. */
const KEYS: Readonly<Record<string, readonly ["x" | "y", -1 | 1]>> = {
  KeyW: ["y", -1],
  ArrowUp: ["y", -1],
  KeyS: ["y", 1],
  ArrowDown: ["y", 1],
  KeyA: ["x", -1],
  ArrowLeft: ["x", -1],
  KeyD: ["x", 1],
  ArrowRight: ["x", 1],
};

/** The window parts the keyboard listens on; a stand-in works in tests. */
export interface KeySource {
  addEventListener: Window["addEventListener"];
  readonly document: Pick<Document, "addEventListener" | "hidden">;
}

/**
 * Movement from WASD and the arrow keys. On each axis the key pressed last wins, so rolling
 * from one direction to the other never cancels to a stop, and a key tapped and let go between
 * two samples still counts for one sample, ahead of keys held from before it.
 */
export class KeyboardMove {
  /** Keys held, by the order they went down in. */
  private readonly held = new Map<string, number>();
  /** Keys pressed since the last sample, held or not. */
  private readonly tapped = new Map<string, number>();
  private order = 0;
  private readonly controller = new AbortController();

  constructor(target: KeySource = window) {
    const signal = this.controller.signal;
    target.addEventListener(
      "keydown",
      (e) => {
        if (!(e.code in KEYS) || e.ctrlKey || e.metaKey || e.altKey) return;
        e.preventDefault();
        if (e.repeat) return;
        const n = ++this.order;
        this.held.set(e.code, n);
        this.tapped.set(e.code, n);
      },
      { signal },
    );
    target.addEventListener("keyup", (e) => this.held.delete(e.code), { signal });
    target.addEventListener("blur", () => this.clear(), { signal });
    target.document.addEventListener(
      "visibilitychange",
      () => {
        if (target.document.hidden) this.clear();
      },
      { signal },
    );
  }

  private clear(): void {
    this.held.clear();
    this.tapped.clear();
  }

  /** The move held now, as wire axes. */
  sample(): [number, number] {
    let x = 0;
    let y = 0;
    let xAt = 0;
    let yAt = 0;
    for (const keys of [this.held, this.tapped]) {
      for (const [code, at] of keys) {
        const [axis, sign] = KEYS[code] as readonly ["x" | "y", -1 | 1];
        if (axis === "x" && at > xAt) {
          xAt = at;
          x = sign * MOVE_MAX;
        } else if (axis === "y" && at > yAt) {
          yAt = at;
          y = sign * MOVE_MAX;
        }
      }
    }
    this.tapped.clear();
    return [x, y];
  }

  dispose(): void {
    this.controller.abort();
  }
}
