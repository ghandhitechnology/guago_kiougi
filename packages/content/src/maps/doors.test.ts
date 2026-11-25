import {
  addPlayer,
  arrivalAt,
  createWorld,
  MOVE_MAX,
  type MoveInput,
  shutDoors,
  step,
  stepDoors,
  TILE_SIZE,
} from "@guago/shared";
import { describe, expect, it } from "vitest";
import { buildAllMaps } from "./index.ts";

/** Ticks a held key is kept down after arriving: three seconds at 20 ticks a second. */
const HELD_TICKS = 60;

describe("every door in the game", () => {
  const maps = buildAllMaps().map((r) => r.map);
  const byId = new Map(maps.map((m) => [m.id, m]));

  it("is walked through once when the key is held on through its far side", () => {
    const bounced: string[] = [];
    let walked = 0;
    for (const from of maps) {
      for (const door of from.portals) {
        const to = byId.get(door.to);
        const spawn = to?.spawns[door.spawn];
        if (!door.built || !to || !spawn) continue;
        // The way back: the door on the far side that leads where the player came from.
        const back = to.portals.filter((p) => p.to === from.id && p.built);
        if (back.length === 0) continue;
        const near = back
          .map((p) => {
            const cx = (p.rect.x + p.rect.w / 2) * TILE_SIZE;
            const cy = (p.rect.y + p.rect.h / 2) * TILE_SIZE;
            return { cx, cy, d: Math.hypot(cx - spawn.x, cy - spawn.y) };
          })
          .sort((a, b) => a.d - b.d)[0];
        if (!near) continue;
        // The key held from the last door points back into it.
        const dx = near.cx - spawn.x;
        const dy = near.cy - spawn.y;
        const key = (seq: number): MoveInput =>
          Math.abs(dx) > Math.abs(dy)
            ? { seq, mx: Math.sign(dx) * MOVE_MAX, my: 0 }
            : { seq, mx: 0, my: Math.sign(dy) * MOVE_MAX };
        const walls = { collision: shutDoors(to.collision, to.portals) };
        let world = addPlayer(createWorld(walls, [], 1), "p", spawn.x, spawn.y);
        let inside = new Map<string, number>();
        const arrival = arrivalAt(to.portals, spawn.x, spawn.y);
        let arrivals = new Map(arrival ? [["p", arrival] as const] : []);
        let fired = 0;
        for (let t = 1; t <= HELD_TICKS; t++) {
          world = step(world, walls, new Map([["p", [key(t)]]]));
          const bodies = world.players.map((p) => ({ ...p, pressing: true }));
          const doors = stepDoors(inside, bodies, to.portals, arrivals);
          inside = new Map(doors.inside);
          arrivals = new Map(doors.arrivals);
          fired += doors.entered.length;
        }
        walked++;
        if (fired > 0) bounced.push(`${from.id} → ${to.id} (${door.spawn}): ${fired}`);
      }
    }
    expect(walked).toBeGreaterThan(10);
    expect(bounced).toEqual([]);
  });
});
