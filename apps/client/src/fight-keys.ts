/**
 * The fight's keys (PLAN §6 input): Space dodges, 1 to 6 cast a book by hand, Tab cycles the
 * control mode, and the mouse aims. Physical keys, so they hold under any keyboard layout. The
 * aim goes out at most ten times a second, as an offset from the player's feet.
 */
export interface FightKeyHandlers {
  dodge(): void;
  cast(slot: number): void;
  cycleMode(): void;
  /** Where the pointer is, in world pixels, or null once it leaves the game. */
  aim(world: { x: number; y: number } | null): void;
}

const AIM_EVERY_MS = 100;

export class FightKeys {
  private readonly controller = new AbortController();
  private lastAim = 0;

  constructor(
    handlers: FightKeyHandlers,
    toWorld: (clientX: number, clientY: number) => { x: number; y: number } | null,
    target: Window = window,
  ) {
    const signal = this.controller.signal;
    target.addEventListener(
      "keydown",
      (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
        if (e.code === "Space") {
          e.preventDefault();
          handlers.dodge();
        } else if (e.code === "Tab") {
          e.preventDefault();
          handlers.cycleMode();
        } else if (/^Digit[1-6]$/.test(e.code)) {
          handlers.cast(Number(e.code.slice(5)) - 1);
        }
      },
      { signal },
    );
    target.addEventListener(
      "pointermove",
      (e) => {
        const now = performance.now();
        if (now - this.lastAim < AIM_EVERY_MS) return;
        this.lastAim = now;
        handlers.aim(toWorld(e.clientX, e.clientY));
      },
      { signal },
    );
    target.document.addEventListener("pointerleave", () => handlers.aim(null), { signal });
  }

  dispose(): void {
    this.controller.abort();
  }
}
