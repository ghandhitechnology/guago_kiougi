/** 피타고라스 학파: the counting floor, its whole-number strikes and the diagonal's weak point. */

import { BOSS_TELL, BossFlag, FxKind, CROTON_GRID as G, Mode, TellKind } from "@guago/shared";
import { type Check, fmt } from "./report.ts";
import { type Arena, arena, at, heal, resetTally, run, type Seat, walk } from "./sim.ts";

const ID = "pythagoreans";
const cx = (c: number) => G.x + (c + 0.5) * G.cell;
const cy = (r: number) => G.y + (r + 0.5) * G.cell;
const corner = (c: number, r: number): [number, number] => [G.x + c * G.cell, G.y + r * G.cell];
const same = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/** A tell is a whole row, a whole column, or one row of an n × n square, of whole squares. */
function shapes(checks: Check[]): void {
  const seats: Seat[] = Array.from({ length: 10 }, (_, i) => ({
    x: cx(1 + ((i * 3) % 14)),
    y: cy(i % G.rows),
    mode: i % 2 ? Mode.Semi : Mode.Auto,
  }));
  const a = arena(ID, seats, { seed: 11, hp: 1e12 });
  let rows = 0;
  let cols = 0;
  let bad = 0;
  const squares = new Map<string, { n: number; rows: number[] }>();
  run(
    a,
    2400,
    (x) => {
      heal(x);
      x.b.debate = x.w.tick >= 1200;
    },
    (x) => {
      for (const e of x.w.effects) {
        if (!e.alive || e.kind !== FxKind.Danger || e.source !== x.b.core.index) continue;
        if (e.born !== x.w.tick) continue;
        const across = same(e.angle, 0);
        const down = same(e.angle, Math.PI / 2);
        const c = (e.x - G.x) / G.cell - 0.5;
        const r = (e.y - G.y) / G.cell - 0.5;
        const span = e.length / G.cell;
        // Axis-aligned, one square wide, from a square's centre to another's: whole squares only.
        const whole =
          (across || down) &&
          same(e.width, G.cell) &&
          same(e.radius, G.cell / 2) &&
          Number.isInteger(c) &&
          Number.isInteger(r) &&
          Number.isInteger(span);
        const kind = e.count - BOSS_TELL;
        if (!whole) bad++;
        else if (kind === TellKind.Lane && across && c === 0 && span === G.cols - 1) rows++;
        else if (kind === TellKind.Lane && down && r === 0 && span === G.rows - 1) cols++;
        else if (kind === TellKind.Square && across) {
          const key = `${e.fireAt}:${c}`;
          const s = squares.get(key) ?? { n: span + 1, rows: [] };
          if (s.n !== span + 1) bad++;
          s.rows.push(r);
          squares.set(key, s);
        } else bad++;
      }
    },
  );
  const sizes = [0, 0, 0, 0, 0];
  for (const s of squares.values()) {
    s.rows.sort((p, q) => p - q);
    const stacked = s.rows.every((r, i) => i === 0 || r === (s.rows[i - 1] as number) + 1);
    if (s.rows.length !== s.n || !stacked || s.n < 2 || s.n > 4) bad++;
    else sizes[s.n] = (sizes[s.n] as number) + 1;
  }
  const squareCount = (sizes[2] as number) + (sizes[3] as number) + (sizes[4] as number);
  checks.push({
    name: "pythagoreans: every tell is a whole row, column or n×n square, never a diagonal",
    pass: bad === 0 && rows > 0 && cols > 0 && squareCount > 0,
    detail: `rows ${rows}, columns ${cols}, squares 2×2 ${sizes[2]} 3×3 ${sizes[3]} 4×4 ${sizes[4]}; diagonal or off the grid ${bad}`,
  });
}

/** Walks waypoints in turn; true once standing on the last. */
function route(a: Arena, i: number, points: readonly [number, number][], leg: number[]): boolean {
  const p = a.players[i] as Arena["players"][number];
  let k = leg[i] ?? 0;
  const [x, y] = points[k] as [number, number];
  if (Math.hypot(p.x - x, p.y - y) < 0.75 && k < points.length - 1) leg[i] = ++k;
  const [nx, ny] = points[k] as [number, number];
  walk(a, p, nx, ny);
  return k === points.length - 1 && Math.hypot(p.x - nx, p.y - ny) < 0.75;
}

const openTo = (a: Arena, i: number) =>
  (a.b.view(a.players[i] as Arena["players"][number]).flags & BossFlag.Open) !== 0;

/** Rows and columns keep a player counted; a unit square crossed corner to corner opens them. */
function gates(checks: Check[]): void {
  // Two walk a rectangle of rows and columns, one walks an L round a square's edges from corner
  // to corner: all in 완전 수동 (no rolls of their own), casting every book.
  const box: [number, number][] = [
    [cx(2), cy(1)],
    [cx(7), cy(1)],
    [cx(7), cy(4)],
    [cx(2), cy(4)],
    [cx(2), cy(1)],
  ];
  const box2 = box.map(([x, y]): [number, number] => [x + 2 * G.cell, y]);
  const ell: [number, number][] = [
    corner(13, 6),
    [corner(13, 6)[0] + 2, corner(14, 7)[1] - 2],
    corner(14, 7),
  ];
  const walkers: Seat[] = [
    { x: at(box, 0)[0], y: at(box, 0)[1], mode: Mode.Manual, cast: true, major: "math" },
    { x: at(box2, 0)[0], y: at(box2, 0)[1], mode: Mode.Manual, cast: true, major: "earth" },
    { x: at(ell, 0)[0] - 10, y: at(ell, 0)[1], mode: Mode.Manual, cast: true, major: "physics" },
  ];
  const a = arena(ID, walkers, { seed: 5, hp: 1e12 });
  const legs: number[] = [];
  let open = 0;
  let ellOpen = 0;
  run(
    a,
    900,
    (x) => {
      heal(x);
      if (route(x, 0, box, legs)) legs[0] = 0;
      if (route(x, 1, box2, legs)) legs[1] = 0;
      route(x, 2, ell, legs);
    },
    (x) => {
      if (openTo(x, 0) || openTo(x, 1)) open++;
      if (openTo(x, 2)) ellOpen++;
    },
  );
  const leak = a.b.rule.gateLeak;
  const raw = (a.raw[0] as number) + (a.raw[1] as number);
  const through = ((a.dealt[0] as number) + (a.dealt[1] as number)) / raw;
  checks.push({
    name: "pythagoreans: a player stepping along rows and columns stays closed, only the leak gets through",
    pass: open === 0 && ellOpen === 0 && Math.abs(through - leak) < 1e-9 && raw > 0,
    detail: `ticks open ${open}, through ${fmt(through, 3)} of ${fmt(raw, 0)} raw (leak ${leak}); corner to corner round the edges, open ${ellOpen} ticks`,
  });

  // One crosses three squares corner to corner exactly, one starts 4 px off the corner the way a
  // hand on a keyboard lines it up.
  const diag: [number, number][] = [corner(9, 5), corner(12, 2)];
  const sloppy: [number, number][] = [
    [corner(3, 7)[0] + 4, corner(3, 7)[1] - 3],
    [corner(6, 4)[0] + 3, corner(6, 4)[1] - 4],
  ];
  const crossers: Seat[] = [
    {
      x: at(diag, 0)[0] - 20,
      y: at(diag, 0)[1] + 20,
      mode: Mode.Manual,
      cast: true,
      major: "math",
    },
    {
      x: at(sloppy, 0)[0] - 15,
      y: at(sloppy, 0)[1] + 15,
      mode: Mode.Manual,
      cast: true,
      major: "earth",
    },
  ];
  const b = arena(ID, crossers, { seed: 5, hp: 1e12 });
  const at2: number[] = [];
  const opened = [-1, -1];
  let before = 0;
  run(
    b,
    600,
    (x) => {
      heal(x);
      route(x, 0, diag, at2);
      route(x, 1, sloppy, at2);
    },
    (x) => {
      for (let i = 0; i < 2; i++) {
        if (!openTo(x, i) || (opened[i] as number) >= 0) continue;
        opened[i] = x.w.tick;
        if (i === 0) {
          before = (x.dealt[0] as number) / (x.raw[0] as number);
          resetTally(x);
        }
      }
      // A few seconds of hits from the open side, then done.
      return (opened[0] as number) > 0 && x.w.tick > (opened[0] as number) + 120;
    },
  );
  const after = (b.dealt[0] as number) / (b.raw[0] as number);
  checks.push({
    name: "pythagoreans: walking a unit square corner to corner opens the weak point, and that player's hits get through fully",
    pass: (opened[0] as number) > 0 && (opened[1] as number) > 0 && Math.abs(after - 1) < 1e-9,
    detail: `exactly through the corners opened at tick ${opened[0]}, 4 px off them at tick ${opened[1]}; through ${fmt(before, 3)} before, ${fmt(after, 3)} after on ${fmt(b.raw[0] as number, 0)} raw`,
  });
  const cues = ["grid-step", "diagonal", "weak-open"] as const;
  const heard = (c: (typeof cues)[number]) => (a.cues.get(c) ?? 0) + (b.cues.get(c) ?? 0);
  checks.push({
    name: "pythagoreans: cues grid-step, diagonal and weak-open fire",
    pass: cues.every((c) => heard(c) > 0),
    detail: cues.map((c) => `${c} ${heard(c)}`).join(", "),
  });
}

export function pythagoreansChecks(): Check[] {
  const checks: Check[] = [];
  shapes(checks);
  gates(checks);
  return checks;
}
