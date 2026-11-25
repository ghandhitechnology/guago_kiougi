import { blocksAt, type CollisionMap, pushOut } from "./collision.ts";
import { TICK_MS, TILE_SIZE } from "./constants.ts";
import {
  type Body,
  Facing,
  type MoveInput,
  moveBody,
  PLAYER_SPEED,
  slide,
  snap,
} from "./movement.ts";
import { nextRandom } from "./rng.ts";

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

export interface SimPlayer extends Body {
  /** Session id. */
  readonly id: string;
  /** Sequence number of the last input applied. */
  readonly seq: number;
  /** Walking speed in pixels per second. */
  readonly speed: number;
}

export interface SimWorld {
  readonly tick: number;
  readonly rng: number;
  /** Map size in world pixels. */
  readonly width: number;
  readonly height: number;
  readonly monsters: readonly SimMonster[];
  /** In join order, which is also the order they step in. */
  readonly players: readonly SimPlayer[];
}

export interface SpawnGroup {
  readonly kind: string;
  readonly count: number;
}

/** Inputs each player spends this tick, by player id, oldest first. */
export type TickInputs = ReadonlyMap<string, readonly MoveInput[]>;

const EDGE = 16;

function roller(seed: number): { roll: () => number; state: () => number } {
  let rng = seed >>> 0;
  return {
    roll: () => {
      const [v, n] = nextRandom(rng);
      rng = n;
      return v;
    },
    state: () => rng,
  };
}

function solidAt(map: CollisionMap, x: number, y: number, r: number): boolean {
  const T = TILE_SIZE;
  for (const [dx, dy] of [
    [0, 0],
    [-r, 0],
    [r, 0],
    [0, -r],
    [0, r],
  ] as const) {
    if (blocksAt(map, Math.floor((x + dx) / T), Math.floor((y + dy) / T))) return true;
  }
  return false;
}

export function createWorld(
  map: CollisionMap,
  spawns: readonly SpawnGroup[],
  seed: number,
): SimWorld {
  const width = map.width * TILE_SIZE;
  const height = map.height * TILE_SIZE;
  const { roll, state } = roller(seed);
  const monsters: SimMonster[] = [];
  for (const group of spawns) {
    for (let i = 0; i < group.count; i++) {
      let x = 0;
      let y = 0;
      for (let tries = 0; tries < 32; tries++) {
        x = EDGE + roll() * (width - 2 * EDGE);
        y = EDGE + roll() * (height - 2 * EDGE);
        if (!solidAt(map, x, y, MONSTER_RADIUS)) break;
      }
      monsters.push({
        id: monsters.length + 1,
        kind: group.kind,
        x,
        y,
        facing: roll() < 0.5 ? Facing.Left : Facing.Right,
        moving: false,
        heading: 0,
        timer: 1 + Math.floor(roll() * 40),
      });
    }
  }
  return { tick: 0, rng: state(), width, height, monsters, players: [] };
}

/** Adds a player standing at (x, y), facing the camera. */
export function addPlayer(world: SimWorld, id: string, x: number, y: number): SimWorld {
  const player: SimPlayer = {
    id,
    x: snap(x),
    y: snap(y),
    facing: Facing.Down,
    seq: 0,
    speed: PLAYER_SPEED,
  };
  return { ...world, players: [...world.players.filter((p) => p.id !== id), player] };
}

export function removePlayer(world: SimWorld, id: string): SimWorld {
  return { ...world, players: world.players.filter((p) => p.id !== id) };
}

/** Applies one player's inputs for this tick, one movement step per input. */
export function stepPlayer(
  map: CollisionMap,
  player: SimPlayer,
  inputs: readonly MoveInput[],
): SimPlayer {
  let body: Body = player;
  let seq = player.seq;
  for (const input of inputs) {
    body = moveBody(map, body, input.mx, input.my, player.speed);
    seq = input.seq;
  }
  if (body === player && seq === player.seq) return player;
  return { ...player, x: body.x, y: body.y, facing: body.facing, seq };
}

function stepMonsters(map: CollisionMap, world: SimWorld, roll: () => number): SimMonster[] {
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
      const p = slide(map, x, y, dx * dist, Math.sin(heading) * dist, MONSTER_RADIUS);
      x = p.x;
      y = p.y;
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
      const d = Math.sqrt(dx * dx + dy * dy);
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

  // Separation can shove a monster into a wall; walls win.
  return moved.map((m) => {
    const p = pushOut(map, m.x, m.y, MONSTER_RADIUS);
    return p.hit ? { ...m, x: p.x, y: p.y } : m;
  });
}

/**
 * Advances the world one fixed tick: every player spends this tick's inputs in join order, then
 * the monsters wander. Pure: the world given is left untouched.
 */
export function step(world: SimWorld, map: CollisionMap, inputs?: TickInputs): SimWorld {
  const { roll, state } = roller(world.rng);
  const players = world.players.map((p) => stepPlayer(map, p, inputs?.get(p.id) ?? []));
  const monsters = stepMonsters(map, world, roll);
  return { ...world, tick: world.tick + 1, rng: state(), monsters, players };
}
