import {
  type Body,
  gridOf,
  MOVE_MAX,
  type MoveInput,
  moveBody,
  PLAYER_SPEED,
  POS_SCALE,
  TILE_SIZE,
} from "@guago/shared";
import { describe, expect, it } from "vitest";
import { SelfMover } from "./self.ts";

const FRAME = 1000 / 60;
const map = gridOf(30, 20, [
  [12, 8],
  [13, 8],
  [14, 8],
  [12, 9],
]);

/** The client against a server that applies each input it is sent and answers every tick. */
function session() {
  const sent: MoveInput[] = [];
  const mover = new SelfMover(map, (i) => sent.push(i));
  let server: Body = { x: 6 * TILE_SIZE, y: 6 * TILE_SIZE, facing: 0 };
  let seq = 0;
  const answer = () =>
    mover.onServer({
      x: server.x * POS_SCALE,
      y: server.y * POS_SCALE,
      facing: server.facing,
      seq,
    });
  answer();
  const serve = () => {
    for (const input of sent.splice(0)) {
      server = moveBody(map, server, input.mx, input.my, PLAYER_SPEED);
      seq = input.seq;
    }
    answer();
  };
  let keys: [number, number] = [0, 0];
  let t = 0;
  const frame = () => {
    const before = Math.floor(t / 50);
    t += FRAME;
    const drawn = mover.frame(FRAME, () => keys, true) as Body;
    if (Math.floor(t / 50) !== before) serve();
    return drawn;
  };
  return {
    mover,
    frame,
    press: (k: [number, number]) => {
      keys = k;
    },
    server: () => server,
  };
}

describe("own player", () => {
  it("moves on the frame a key goes down and stops on the frame it comes up", () => {
    const s = session();
    for (let i = 0; i < 7; i++) s.frame(); // land somewhere inside a tick
    const still = s.frame();
    s.press([MOVE_MAX, 0]);
    const first = s.frame();
    expect(first.x).toBeGreaterThan(still.x);
    for (let i = 0; i < 20; i++) s.frame();
    s.press([0, 0]);
    const stopped = s.frame();
    for (let i = 0; i < 10; i++) expect(s.frame().x).toBe(stopped.x);
  });

  it("leaves the server where the player was drawn, walls and all, with nothing to correct", () => {
    const s = session();
    let seed = 3;
    const roll = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let walk = 0; walk < 40; walk++) {
      const axis = () => [-MOVE_MAX, 0, MOVE_MAX][Math.floor(roll() * 3)] as number;
      s.press([axis(), axis()]);
      for (let i = Math.floor(roll() * 40); i > 0; i--) s.frame();
      s.press([0, 0]);
      let drawn = s.frame();
      for (let i = 0; i < 12; i++) drawn = s.frame();
      expect(Math.abs(s.server().x - drawn.x)).toBeLessThanOrEqual(0.25);
      expect(Math.abs(s.server().y - drawn.y)).toBeLessThanOrEqual(0.25);
    }
    expect(s.mover.corrections).toBe(0);
  });
});
