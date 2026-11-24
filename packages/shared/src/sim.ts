import { TICK_MS } from "./constants.ts";
import { nextRandom } from "./rng.ts";

/** Which way an entity looks. Sprites authored facing right flip for `Left`. */
export const Facing = { Down: 0, Up: 1, Left: 2, Right: 3 } as const;
export type Facing = (typeof Facing)[keyof typeof Facing];

/** Collider radius of a small monster, in pixels. */
export const MONSTER_RADIUS = 6;
/** Wander speed in pixels per second. */
export const WANDER_SPEED = 22;

export interface SimMonster {
  readonly id: number;
  readonly kind: string;
  readonly x: number;
  readonly y: number;
  readonly facing: Facing;
  readonly moving: boolean;
  /** Heading in radians while walking. */
  readonly heading: number;
  /** Ticks left in the current walk or rest. */
  readonly timer: number;
}

export interface SimWorld {
  readonly tick: number;
  readonly rng: number;
  /** Walkable area in world pixels. */
  readonly width: number;
  readonly height: number;
  readonly monsters: readonly SimMonster[];
}

export interface SpawnGroup {
  readonly kind: string;
  readonly count: number;
}

const EDGE = 16;

export function createWorld(
  width: number,
  height: number,
  spawns: readonly SpawnGroup[],
  seed: number,
): SimWorld {
  let rng = seed >>> 0;
  const roll = (): number => {
    const [v, n] = nextRandom(rng);
    rng = n;
    return v;
  };
  const monsters: SimMonster[] = [];
  for (const group of spawns) {
    for (let i = 0; i < group.count; i++) {
      monsters.push({
        id: monsters.length + 1,
        kind: group.kind,
        x: EDGE + roll() * (width - 2 * EDGE),
        y: EDGE + roll() * (height - 2 * EDGE),
        facing: roll() < 0.5 ? Facing.Left : Facing.Right,
        moving: false,
        heading: 0,
        timer: 1 + Math.floor(roll() * 40),
      });
    }
  }
  return { tick: 0, rng, width, height, monsters };
}

/** Advances the world one fixed tick. Pure: the input is left untouched. */
export function step(world: SimWorld): SimWorld {
  let rng = world.rng;
  const roll = (): number => {
    const [v, n] = nextRandom(rng);
    rng = n;
    return v;
  };
  const dist = (WANDER_SPEED * TICK_MS) / 1000;

  const moved = world.monsters.map((m) => {
    let { x, y, facing, moving, heading, timer } = m;
    if (--timer <= 0) {
      moving = !moving;
      if (moving) {
        // Lean the new heading back toward the middle so nobody hugs an edge for long.
        const toCentre = Math.atan2(world.height / 2 - y, world.width / 2 - x);
        heading = roll() < 0.3 ? toCentre : roll() * Math.PI * 2;
        timer = 15 + Math.floor(roll() * 35);
      } else {
        timer = 10 + Math.floor(roll() * 40);
      }
    }
    if (moving) {
      const dx = Math.cos(heading);
      x += dx * dist;
      y += Math.sin(heading) * dist;
      if (dx > 0.2) facing = Facing.Right;
      else if (dx < -0.2) facing = Facing.Left;
    }
    return { ...m, x, y, facing, moving, heading, timer };
  });

  // Separation: push overlapping pairs apart along the line between them.
  const min = MONSTER_RADIUS * 2;
  for (let i = 0; i < moved.length; i++) {
    for (let j = i + 1; j < moved.length; j++) {
      const a = moved[i] as SimMonster;
      const b = moved[j] as SimMonster;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d >= min) continue;
      if (d === 0) {
        dx = 1;
        dy = 0;
      } else {
        dx /= d;
        dy /= d;
      }
      const push = (min - d) / 2;
      moved[i] = { ...a, x: a.x - dx * push, y: a.y - dy * push };
      moved[j] = { ...b, x: b.x + dx * push, y: b.y + dy * push };
    }
  }

  const monsters = moved.map((m) => ({
    ...m,
    x: Math.min(world.width - EDGE, Math.max(EDGE, m.x)),
    y: Math.min(world.height - EDGE, Math.max(EDGE, m.y)),
  }));
  return { ...world, tick: world.tick + 1, rng, monsters };
}
