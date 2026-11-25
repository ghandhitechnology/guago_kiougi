import { type Collidable, isSolidTile, TILE_SIZE } from "@guago/shared";
import type { Vec } from "./layers.ts";

/**
 * Patrols for a 위험 구역 (PLAN §11): a guard walks a route of waypoints at a steady pace,
 * pauses at each, and sees in a cone ahead of it. Anyone it sees is spotted (the server
 * teleports them out with 벌점). Walls and anything solid block its sight, so cover works.
 */
export interface PatrolSource {
  readonly id: string;
  /** What walks it: a monster or cast id the server spawns on the route. */
  readonly walker: string;
  /** Waypoints, in tiles, walked in order. */
  readonly route: readonly Vec[];
  /** `cycle` returns from the last waypoint to the first; `pingpong` walks back the same way. */
  readonly loop: "cycle" | "pingpong";
  /** Tiles per second. */
  readonly speed: number;
  /** Seconds standing at each waypoint before walking on. */
  readonly pause: number;
  /** Vision: how far, in tiles, and the cone's full angle, in degrees. */
  readonly cone: { readonly length: number; readonly angle: number };
}

/** A patrol as built: route in world pixels (tile centres), speed in pixels per second. */
export interface Patrol {
  readonly id: string;
  readonly walker: string;
  readonly route: readonly { readonly x: number; readonly y: number }[];
  readonly loop: "cycle" | "pingpong";
  readonly speed: number;
  readonly pause: number;
  /** Cone length in pixels, full angle in degrees. */
  readonly cone: { readonly length: number; readonly angle: number };
}

export function buildPatrol(p: PatrolSource): Patrol {
  return {
    id: p.id,
    walker: p.walker,
    route: p.route.map(([tx, ty]) => ({
      x: tx * TILE_SIZE + TILE_SIZE / 2,
      y: ty * TILE_SIZE + TILE_SIZE / 2,
    })),
    loop: p.loop,
    speed: p.speed * TILE_SIZE,
    pause: p.pause,
    cone: { length: p.cone.length * TILE_SIZE, angle: p.cone.angle },
  };
}

/**
 * A walk: someone in town going about a round of errands on a route (the water-carrier between
 * the fountain and the street, the messenger across the square). A patrol with no eyes: the same
 * route, pace and pauses, and nobody gets caught.
 */
export type WalkSource = Omit<PatrolSource, "cone">;
export type Walk = Omit<Patrol, "cone">;

export function buildWalk(w: WalkSource): Walk {
  const { cone: _cone, ...rest } = buildPatrol({ ...w, cone: { length: 1, angle: 1 } });
  return rest;
}

/** The waypoints walked in one full round, closing the loop. */
function legs(p: Walk): { x: number; y: number }[] {
  const pts = [...p.route];
  if (p.loop === "pingpong") pts.push(...[...p.route].reverse().slice(1));
  else if (pts.length > 1) pts.push(p.route[0] as { x: number; y: number });
  return pts;
}

/** Seconds one full round takes, pauses included. */
export function roundTime(p: Walk): number {
  const pts = legs(p);
  let t = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i] as { x: number; y: number };
    const b = pts[i + 1] as { x: number; y: number };
    t += Math.hypot(b.x - a.x, b.y - a.y) / p.speed + p.pause;
  }
  return t;
}

export interface Pose {
  readonly x: number;
  readonly y: number;
  /** Where it looks, radians, 0 east, clockwise in screen space. */
  readonly facing: number;
}

/**
 * Where the guard is at `t` seconds: walking a leg, or standing at the waypoint it reached,
 * already looking down the next leg. Deterministic, so every client draws the same guard.
 */
export function patrolPose(p: Walk, t: number): Pose {
  const pts = legs(p);
  const first = pts[0] ?? { x: 0, y: 0 };
  if (pts.length < 2) return { x: first.x, y: first.y, facing: 0 };
  const round = roundTime(p);
  let left = ((t % round) + round) % round;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i] as { x: number; y: number };
    const b = pts[i + 1] as { x: number; y: number };
    const facing = Math.atan2(b.y - a.y, b.x - a.x);
    const walk = Math.hypot(b.x - a.x, b.y - a.y) / p.speed;
    if (left < walk) {
      const k = left / walk;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, facing };
    }
    left -= walk;
    if (left < p.pause) {
      const c = pts[i + 2] ?? pts[1] ?? b;
      return { x: b.x, y: b.y, facing: Math.atan2(c.y - b.y, c.x - b.x) };
    }
    left -= p.pause;
  }
  return { x: first.x, y: first.y, facing: 0 };
}

/**
 * Whether a guard at `pose` sees the point (x, y): inside the cone, and no solid tile on the
 * straight line between them.
 */
export function sees(map: Collidable, p: Patrol, pose: Pose, x: number, y: number): boolean {
  const dx = x - pose.x;
  const dy = y - pose.y;
  const d = Math.hypot(dx, dy);
  if (d > p.cone.length) return false;
  if (d > 0) {
    let off = Math.atan2(dy, dx) - pose.facing;
    off = Math.atan2(Math.sin(off), Math.cos(off));
    if (Math.abs(off) > ((p.cone.angle / 2) * Math.PI) / 180) return false;
  }
  return clearLine(map, pose.x, pose.y, x, y);
}

/** Whether every tile a straight line passes over is walkable, sampled every quarter tile. */
export function clearLine(
  map: Collidable,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (TILE_SIZE / 4)));
  for (let k = 0; k <= steps; k++) {
    const x = x0 + ((x1 - x0) * k) / steps;
    const y = y0 + ((y1 - y0) * k) / steps;
    if (isSolidTile(map, Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE))) return false;
  }
  return true;
}
