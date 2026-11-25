import type * as Phaser from "phaser";

/**
 * Paper motion. Everything is under 200 ms and starts from wherever the object is now, so a
 * panel closed halfway through opening simply turns round.
 */
export type Target = Phaser.GameObjects.GameObject & {
  x: number;
  y: number;
  alpha: number;
  visible: boolean;
  setVisible(on: boolean): unknown;
  setAlpha(a: number): unknown;
  setScale(x: number, y?: number): unknown;
  setPosition(x: number, y?: number): unknown;
};

/**
 * Running tweens per object and channel: a move and a fade can run together, and a new move
 * replaces only the move. `all` replaces everything, for whole-sheet motions.
 */
type Channel = "move" | "fade" | "all";
const running = new WeakMap<object, Map<Channel, Phaser.Tweens.Tween>>();

function run(
  target: Target,
  props: Record<string, number>,
  ms: number,
  ease: string,
  done?: () => void,
  channel: Channel = "all",
): void {
  const scene = target.scene;
  let mine = running.get(target);
  if (!mine) {
    mine = new Map();
    running.set(target, mine);
  }
  if (channel === "all") {
    scene.tweens.killTweensOf(target);
    mine.clear();
  } else {
    mine.get(channel)?.stop();
    mine.get("all")?.stop();
  }
  const tween = scene.tweens.add({
    targets: target,
    ...props,
    duration: ms,
    ease,
    ...(done ? { onComplete: done } : {}),
  });
  mine.set(channel, tween);
}

/** Where an object rests when fully shown. */
export interface Rest {
  readonly x: number;
  readonly y: number;
}

/**
 * A sheet laid down on the desk: rises a few pixels into place while it unfolds from its top
 * edge. Containers scale about their top left, so the top edge stays put.
 */
export function layDown(target: Target, rest: Rest, done?: () => void): void {
  if (!target.visible || target.alpha === 0) {
    target.setVisible(true);
    target.setAlpha(0);
    target.setScale(1, 0.86);
    target.setPosition(rest.x, rest.y + 10);
  }
  run(target, { x: rest.x, y: rest.y, scaleX: 1, scaleY: 1, alpha: 1 }, 170, "Cubic.Out", done);
}

/** The sheet picked up again: drops and folds away, then hides. */
export function pickUp(target: Target, rest: Rest, done?: () => void): void {
  run(target, { y: rest.y + 10, scaleY: 0.86, alpha: 0 }, 120, "Cubic.In", () => {
    target.setVisible(false);
    done?.();
  });
}

/**
 * A page turned over about the spine at the left: the page narrows to its spine, `turn`
 * swaps what is printed on it, and the page opens again.
 */
export function turnPage(target: Target, turn: () => void, done?: () => void): void {
  run(target, { scaleX: 0 }, 80, "Quad.In", () => {
    turn();
    run(target, { scaleX: 1 }, 110, "Quad.Out", done);
  });
}

/** A rubber stamp: lands big and settles with a thump. */
export function stamp(target: Target, rest: Rest, done?: () => void): void {
  target.setVisible(true);
  target.setAlpha(0);
  target.setScale(1.6);
  target.setPosition(rest.x, rest.y);
  run(target, { scaleX: 1, scaleY: 1, alpha: 1 }, 130, "Quad.In", () => {
    nudge(target, rest, 0, 1, done);
  });
}

/** A short shake sideways: a wrong answer. */
export function shake(target: Target, rest: Rest): void {
  const scene = target.scene;
  scene.tweens.killTweensOf(target);
  target.setPosition(rest.x, rest.y);
  scene.tweens.chain({
    targets: target,
    tweens: [
      { x: rest.x + 3, duration: 30 },
      { x: rest.x - 3, duration: 40 },
      { x: rest.x + 2, duration: 40 },
      { x: rest.x, duration: 40 },
    ],
  });
}

/** A one-pixel bump that springs back. */
export function nudge(target: Target, rest: Rest, dx: number, dy: number, done?: () => void) {
  const scene = target.scene;
  scene.tweens.killTweensOf(target);
  target.setPosition(rest.x + dx, rest.y + dy);
  scene.tweens.add({
    targets: target,
    x: rest.x,
    y: rest.y,
    duration: 90,
    ease: "Quad.Out",
    ...(done ? { onComplete: done } : {}),
  });
}

/** Slides an object to a resting place. */
export function slide(target: Target, to: Rest, ms = 160, done?: () => void): void {
  run(target, { x: to.x, y: to.y }, ms, "Cubic.Out", done, "move");
}

/** Fades an object in or out. */
export function fade(target: Target, alpha: number, ms = 140, done?: () => void): void {
  if (alpha > 0) target.setVisible(true);
  run(
    target,
    { alpha },
    ms,
    "Quad.Out",
    () => {
      if (alpha === 0) target.setVisible(false);
      done?.();
    },
    "fade",
  );
}
