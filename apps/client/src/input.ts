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

/**
 * Movement from WASD and the arrow keys. On each axis the key pressed last wins, so rolling
 * from one direction to the other never cancels to a stop, and a tap shorter than a tick still
 * moves for one tick.
 */
export class KeyboardMove {
  private readonly held: string[] = [];
  private readonly tapped: string[] = [];
  private readonly controller = new AbortController();

  constructor(target: Window = window) {
    const signal = this.controller.signal;
    target.addEventListener(
      "keydown",
      (e) => {
        if (!(e.code in KEYS) || e.ctrlKey || e.metaKey || e.altKey) return;
        e.preventDefault();
        if (e.repeat) return;
        this.release(e.code);
        this.held.push(e.code);
        this.tapped.push(e.code);
      },
      { signal },
    );
    target.addEventListener("keyup", (e) => this.release(e.code), { signal });
    target.addEventListener("blur", () => this.clear(), { signal });
    target.document.addEventListener(
      "visibilitychange",
      () => {
        if (target.document.hidden) this.clear();
      },
      { signal },
    );
  }

  private release(code: string): void {
    const i = this.held.indexOf(code);
    if (i >= 0) this.held.splice(i, 1);
  }

  private clear(): void {
    this.held.length = 0;
    this.tapped.length = 0;
  }

  /** The move to send for this tick, as wire axes. */
  sample(): [number, number] {
    let x = 0;
    let y = 0;
    for (const code of [...this.tapped, ...this.held]) {
      const [axis, sign] = KEYS[code] as readonly ["x" | "y", -1 | 1];
      if (axis === "x") x = sign * MOVE_MAX;
      else y = sign * MOVE_MAX;
    }
    this.tapped.length = 0;
    return [x, y];
  }

  dispose(): void {
    this.controller.abort();
  }
}
