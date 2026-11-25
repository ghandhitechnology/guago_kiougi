import { type Legend, sprite, variant } from "../../format.ts";
import { clean, ell, framesOf, line, names, Pic, paintAt, put, rng } from "../../fx.ts";

/**
 * Feedback for the player and the things they pick up: dodge dust and streaks, the level-up
 * pillar, pickup twinkles, knocked-out stars and the revive glow, and the drops themselves. Gold
 * means reward here (the 원서 grade, the 상점 sticker), white means the player is fine.
 */
const FEED: Legend = {
  ".": null,
  W: "stone.bright",
  c: "stone.pale",
  s: "stone.light",
  S: "stone.mid",
  q: "stone.deep",
  // Gold, for rewards.
  o: "gold.deep",
  d: "gold.dark",
  m: "gold.mid",
  l: "gold.light",
  p: "gold.pale",
  // Lone sparkles and motes.
  "*": "stone.bright",
  "'": "stone.pale",
  ",": "gold.pale",
  "`": "gold.light",
};
const LONE = "*',`";
const fx = { group: "combat", outline: false, palette: FEED, lone: LONE } as const;

// Dodge -------------------------------------------------------------------------------------

/** Dust kicked up where the roll starts, drifting back and settling. */
function dust(k: number): Pic {
  const pic = Pic.blank(22, 10);
  const puffs: [number, number, number][] = [
    [6, 7, 2.6],
    [11, 6, 3],
    [16, 7, 2.2],
  ];
  for (const [x, y, r] of puffs) {
    const rr = r * ([0.7, 1, 1.1][k] as number);
    const dx = -k * 2;
    put(
      pic,
      paintAt(22, 10, (px, py) => {
        const e = ell(px, py, x + dx, y - k * 0.5, rr, rr * 0.75);
        if (e > 1) return null;
        if (k === 2) return e > 0.55 ? "s" : null;
        return py < y - k * 0.5 - rr * 0.2 ? "c" : "s";
      }),
      0,
      0,
    );
  }
  return clean(pic);
}

const dodgeDust = sprite({
  ...fx,
  name: "fx-dodge-dust",
  size: [22, 10],
  origin: [11, 8],
  frames: framesOf("d", [0, 1, 2].map(dust)),
  anim: { kick: { frames: names("d", 3), fps: 12, loop: false, jump: 1 } },
});

/**
 * Speed lines behind the roll, drawn with the after-image: the client draws two ghosts of the
 * character's composite in white at the last two positions, and these lines between them.
 */
const dodgeStreak = sprite({
  ...fx,
  name: "fx-dodge-streak",
  blend: "add",
  size: [24, 20],
  origin: [20, 18],
  frames: {
    s0: (() => {
      const p = Pic.blank(24, 20);
      line(p, 4, 5, 20, 5, "c");
      line(p, 1, 10, 21, 10, "W");
      line(p, 6, 15, 19, 15, "c");
      return p.toString();
    })(),
    s1: (() => {
      const p = Pic.blank(24, 20);
      line(p, 10, 5, 20, 5, "s");
      line(p, 8, 10, 21, 10, "c");
      line(p, 13, 15, 19, 15, "s");
      return p.toString();
    })(),
  },
  anim: { streak: { frames: ["s0", "s1"], fps: 14, loop: false, jump: 1 } },
});

// Level up ----------------------------------------------------------------------------------

/**
 * Level up: a gold ring flashes at the feet, a pillar of light goes up through the character,
 * stars ride up it, the pillar thins and leaves sparkles.
 */
function levelUp(k: number): Pic {
  const w = 32;
  const h = 56;
  const cx = 16;
  const foot = 50;
  const pic = Pic.blank(w, h);
  const ring = (rx: number, ch: string, light: string) =>
    put(
      pic,
      paintAt(w, h, (x, y) => {
        const e = (ell(x, y, cx, foot, rx, rx * 0.36) - 1) * rx * 0.36;
        return e > 0.5 || e < -1.1 ? null : y < foot ? light : ch;
      }),
      0,
      0,
    );
  if (k <= 2) ring([7, 11, 14][k] as number, "l", k === 0 ? "W" : "p");
  const width = [0, 3.5, 4.5, 3, 1.5, 0][k] as number;
  const top = [foot, 14, 2, 2, 8, foot][k] as number;
  if (width > 0) {
    put(
      pic,
      paintAt(w, h, (x, y) => {
        if (y < top || y > foot) return null;
        const d = Math.abs(x - cx);
        const taper = y < top + 6 ? (y - top) / 6 : 1;
        const half = width * taper;
        if (d > half) return null;
        return d < half - 2 ? "W" : d < half - 1 ? "p" : "l";
      }),
      0,
      0,
    );
  }
  const r = rng(21);
  const stars = k >= 2 ? 5 : 0;
  for (let i = 0; i < stars; i++) {
    const x = cx + (r() - 0.5) * 22;
    const y = foot - 8 - ((r() * 30 + k * 7) % 40);
    if (k <= 3) put(pic, ".p.\nplp\n.p.", x - 1, y - 1);
    else pic.set(Math.round(x), Math.round(y), i % 2 ? "," : "*");
  }
  return clean(pic, LONE);
}

const levelUpSprite = sprite({
  ...fx,
  name: "fx-levelup",
  blend: "add",
  size: [32, 56],
  origin: [16, 50],
  frames: framesOf("l", [0, 1, 2, 3, 4, 5].map(levelUp)),
  anim: { burst: { frames: names("l", 6), fps: 12, loop: false, jump: 1 } },
});

// Pickups -----------------------------------------------------------------------------------

const pickup = sprite({
  ...fx,
  name: "fx-pickup",
  blend: "add",
  size: [13, 13],
  origin: [6, 6],
  frames: {
    p0: put(Pic.blank(13, 13), ".p.\np*p\n.p.", 5, 5).toString(),
    p1: (() => {
      const p = Pic.blank(13, 13);
      line(p, 6, 1, 6, 11, "p");
      line(p, 1, 6, 11, 6, "p");
      line(p, 6, 3, 6, 9, "W");
      line(p, 3, 6, 9, 6, "W");
      put(p, "WWW\nWWW\nWWW", 5, 5);
      return p.toString();
    })(),
    p2: (() => {
      const p = Pic.blank(13, 13);
      for (const [x, y] of [
        [6, 2],
        [10, 6],
        [6, 10],
        [2, 6],
      ] as const)
        put(p, "pp\npp", x - (x > 6 ? 0 : x < 6 ? 1 : 0), y - (y > 6 ? 0 : y < 6 ? 1 : 0));
      return p.toString();
    })(),
    p3: (() => {
      const p = Pic.blank(13, 13);
      for (const [x, y, ch] of [
        [6, 0, ","],
        [12, 6, "*"],
        [6, 12, ","],
        [0, 6, "*"],
      ] as const)
        p.set(x, y, ch);
      return p.toString();
    })(),
  },
  anim: { twinkle: { frames: ["p0", "p1", "p2", "p3"], fps: 16, loop: false, jump: 1 } },
});

// Knocked out and revive ----------------------------------------------------------------------

/** Three stars circling the head of a knocked-out student. */
const KO_STAR = "..d..\n.dld.\ndl*ld\n.dld.\n..d..";
const KO_STAR_BACK = "..o..\n.omo.\nom`mo\n.omo.\n..o..";
const koStars = sprite({
  ...fx,
  name: "fx-ko-stars",
  size: [26, 12],
  origin: [13, 9],
  frames: Object.fromEntries(
    [0, 1, 2, 3].map((k) => {
      const p = Pic.blank(26, 12);
      const pts = [0, 1, 2].map((i) => {
        const a = ((i / 3 + k / 12) % 1) * Math.PI * 2;
        return [13 + Math.cos(a) * 9, 6 + Math.sin(a) * 2.5, Math.sin(a)] as const;
      });
      for (const [x, y, depth] of [...pts].sort((a, b) => a[2] - b[2])) {
        put(p, depth < -0.3 ? KO_STAR_BACK : KO_STAR, x - 2, y - 2);
      }
      return [`k${k}`, p.toString()];
    }),
  ),
  anim: { spin: { frames: names("k", 4), fps: 8, jump: 1 } },
});

/** The revive: a soft white column over the student while a friend holds them up. */
function revive(k: number): Pic {
  const w = 26;
  const h = 34;
  const cx = 13;
  const foot = 30;
  const pic = paintAt(w, h, (x, y) => {
    const e = ell(x, y, cx, foot, 10, 3.4);
    if (e <= 1 && e > 0.7) return y < foot ? "W" : "s";
    return null;
  });
  const r = rng(5);
  for (let i = 0; i < 7; i++) {
    const x = cx + (r() - 0.5) * 16;
    const y = foot - 2 - ((r() * 26 + k * 6) % 26);
    const life = (foot - y) / 26;
    put(pic, life < 0.5 ? "c\nW" : life < 0.8 ? "c" : "'", x, y);
  }
  return clean(pic, LONE);
}

const reviveSprite = sprite({
  ...fx,
  name: "fx-revive",
  blend: "add",
  size: [26, 34],
  origin: [13, 30],
  frames: framesOf("r", [0, 1, 2, 3].map(revive)),
  anim: { glow: { frames: names("r", 4), fps: 8, jump: 1 } },
});

// Drops -------------------------------------------------------------------------------------

/**
 * 낱장 on the ground: a page torn from that class's book, its header band and mark in the class
 * colour, catching the light now and then.
 */
const PAGE: Legend = {
  ...FEED,
  q: "stone.deep",
  // Class colours: dark, mid, light.
  A: "navy.dark",
  B: "navy.light",
  C: "navy.pale",
};
const PAGE_GRID = `
  ...........
  .qqqqqqqq..
  .qAABBBBAq.
  .qAABBBBAq.
  .qWWWWWWcq.
  .qWssssWcq.
  .qWWWWWWcq.
  .qWsssWWcq.
  .qWWWWWWcq.
  ..qWsssWcq.
  ..qqqqqqqq.
  ...........
`;
const PAGE_GLINT = `
  ...........
  .qqqqqqqq..
  .qAABBBBAq.
  .qAACBBBAq.
  .qWWWWWWcq.
  .qWssssWcq.
  .qWWWWWWcq.
  .qWsssWWcq.
  .qWWWWWWcq.
  ..qWsssWcq.
  ..qqqqqqqq.
  ...........
`;

const pageMath = sprite({
  name: "drop-page-math",
  group: "combat",
  palette: PAGE,
  lone: "C",
  size: [11, 12],
  origin: [5, 10],
  frames: { idle: PAGE_GRID, glint: PAGE_GLINT },
  anim: { idle: { frames: ["idle", "idle", "idle", "idle", "glint"], fps: 5, jump: 0.2 } },
});
const pages = [
  pageMath,
  variant(pageMath, { name: "drop-page-physics", recolor: { "navy.*": "plum.*" } }),
  variant(pageMath, { name: "drop-page-chemistry", recolor: { "navy.*": "sea.*" } }),
  variant(pageMath, { name: "drop-page-biology", recolor: { "navy.*": "grass.*" } }),
  variant(pageMath, { name: "drop-page-earth", recolor: { "navy.*": "gold.*" } }),
];

/** An elite's drop: a sheaf of pages tied with gold ribbon, its bow catching the light. */
const elite = sprite({
  name: "drop-elite",
  group: "combat",
  palette: FEED,
  lone: LONE,
  size: [14, 14],
  origin: [7, 12],
  frames: {
    idle: `
      ..............
      ..qqqqqqqqqq..
      .qWWWWWlWWWcq.
      .qWsssslssWcq.
      .qWWWWWlWWWcq.
      .oooooolooooo.
      .olllllWWlllo.
      .oooooolooooo.
      .qWsssslssWcq.
      .qWWWWWlWWWcq.
      .qsssssmssssq.
      .qcccccmccccq.
      ..qqqqqqqqqq..
      ..............
    `,
    glint: `
      ..............
      ..qqqqqqqqqq..
      .qWWWWWlWWWcq.
      .qWsssslW*Wcq.
      .qWWWWWlWWWcq.
      .oooooolooooo.
      .olllllWWlllo.
      .oooooolooooo.
      .qWsssslssWcq.
      .qWWWWWlWWWcq.
      .qsssssmssssq.
      .qcccccmccccq.
      ..qqqqqqqqqq..
      ..............
    `,
  },
  anim: { idle: { frames: ["idle", "idle", "idle", "glint"], fps: 5, jump: 0.2 } },
});

/**
 * The rare-drop beam: a tall column of light standing on the drop with a twinkle riding up it,
 * visible from across the screen. Gold for 원서; the blue and purple copies follow the grades.
 */
function beam(k: number): Pic {
  const w = 11;
  const h = 64;
  const cx = 5;
  const foot = 60;
  const pic = paintAt(w, h, (x, y) => {
    if (y > foot) return null;
    const up = foot - y;
    const fade = up / 56;
    const half = 1.6 - fade * 0.9 + (k % 2 ? 0.3 : 0);
    const d = Math.abs(x + 0.5 - cx - 0.5);
    if (d > half + 0.5 || fade > 1) return null;
    if (fade > 0.75 && (y + k) % 3 === 0) return null;
    return d < half - 0.6 ? (fade < 0.5 ? "W" : "p") : "l";
  });
  const twinkleY = foot - 8 - ((k * 13) % 44);
  put(pic, "..p..\n.plp.\nplWlp\n.plp.\n..p..", cx - 2, twinkleY - 2);
  put(
    pic,
    paintAt(w, h, (x, y) => (ell(x, y, cx + 0.5, foot, 5, 2) <= 1 ? "l" : null)),
    0,
    0,
  );
  return clean(pic, LONE);
}

const glint = sprite({
  ...fx,
  name: "drop-glint",
  blend: "add",
  size: [11, 64],
  origin: [5, 60],
  frames: framesOf("g", [0, 1, 2, 3].map(beam)),
  anim: { shine: { frames: names("g", 4), fps: 6, jump: 1 } },
});
const glints = [
  glint,
  variant(glint, { name: "drop-glint-blue", recolor: { "gold.*": "navy.*" } }),
  variant(glint, { name: "drop-glint-purple", recolor: { "gold.*": "plum.*" } }),
];

export default [
  dodgeDust,
  dodgeStreak,
  levelUpSprite,
  pickup,
  koStars,
  reviveSprite,
  ...pages,
  elite,
  ...glints,
];
