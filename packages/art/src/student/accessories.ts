import { type Dir, type PartDef, part, type Vec } from "../format.ts";
import { gridRows } from "../grid.ts";
import { armL, ink, lone, mirror, withKo } from "./base.ts";

// Accessories -------------------------------------------------------------------------------

/** Round gold frames. Fringes and side hair fall over them. */
export const glasses = withKo(
  part({
    palette: ink,
    under: "hair",
    pieces: {
      head: {
        at: { down: [5, 7], up: [5, 7], side: [3, 7] },
        down: `
          ...DD....DD...
          ..D..DDDD..D..
          ..D..D..D..D..
          ..DDD....DDD..
        `,
        up: null,
        side: `
          ..........DDDD.
          .............D.
          .............D.
        `,
      },
    },
  }),
);

/** Lab goggles pushed up on the forehead, never once pulled down. */
export const goggles = withKo(
  part({
    palette: ink,
    lone,
    pieces: {
      head: {
        at: { down: [5, 3], up: [5, 5], side: [3, 5] },
        down: `
          ..GGGGGGGGGG..
          ..G~LLGG~LLG..
          ..GGGGGGGGGG..
        `,
        up: null,
        side: `
          ..........GGGG.
          ........eeGLLG.
          ..........GGGG.
        `,
      },
    },
  }),
);

/** Extra materials for worn things: gold, sea, rose and grass beside the student legend. */
const gear = {
  ...ink,
  A: "gold.light",
  Y: "gold.pale",
  E: "gold.dark",
  B: "sea.deep",
  d: "sea.mid",
  K: "rose.deep",
  P: "rose.dark",
  Q: "rose.mid",
  F: "grass.deep",
  f: "grass.dark",
  o: "grass.mid",
  Z: "grass.light",
} as const;

/** White headphones round the neck, the cups on the collarbones, the band behind. Hair falls over them. */
export const headphones = withKo(
  part({
    palette: gear,
    lone,
    under: "hair",
    pieces: {
      torso: {
        at: { down: [6, 12], up: [8, 13], side: [9, 12] },
        down: `
          .GG....GG.
          G^pG..GqqG
          GppG..GqqG
          .GG....GG.
        `,
        up: `
          GGGGGGGG
          GqqqqqqG
        `,
        side: `
          GG....
          .GGGG.
          .G^ppG
          .GpqqG
          ..GGG.
        `,
      },
    },
  }),
);

/** A teal barrette above the right temple, the one colour no hair dye in the dorm comes in. */
export const hairclip = withKo(
  part({
    palette: gear,
    pieces: {
      head: {
        at: { down: [4, 5], up: [16, 5], side: [9, 5] },
        down: `
          BBBB
          BLLB
          BBBB
        `,
        up: `
          BBBB
          BddB
          BBBB
        `,
        side: `
          BBBB
          BLLB
          BBBB
        `,
      },
    },
  }),
);

/** 턱스크: a blue mask pulled down under the chin, where it lives between classes. */
export const mask = withKo(
  part({
    palette: gear,
    lone,
    under: "hair",
    pieces: {
      head: {
        at: { down: [6, 9], up: [6, 9], side: [11, 10] },
        down: `
          B..........B
          B..........B
          .BLLLLLLLlB.
          ..BLLLLLlB..
          ...BLLLlB...
          ....BBBB....
        `,
        up: null,
        side: `
          B......
          .BLLLLB
          .BLLLB.
          ..BBB..
        `,
      },
    },
  }),
);

/** 명찰: the student ID on a yellow lanyard. Worn inside the rifts too, by order of the principal. */
export const lanyard = withKo(
  part({
    palette: gear,
    lone,
    under: "hair",
    pieces: {
      torso: {
        at: { down: [10, 14], up: [10, 12], side: [15, 14] },
        down: `
          .aa.
          GGGG
          GvvG
          GwwG
          GGGG
        `,
        up: `
          aaaa
        `,
        side: `
          GG
          G^
          G^
          GG
        `,
      },
    },
  }),
);

// The 코스튬 진열장's first stock and two Page 1 rewards ---------------------------------------

/** 담요: a pink fleece blanket round the shoulders, for the 자습실 after the heating goes off. */
export const blanket = withKo(
  part({
    palette: gear,
    lone,
    under: "hair",
    pieces: {
      torso: {
        at: { down: [5, 12], up: [5, 12], side: [6, 12] },
        down: `
          .KKKK....KKKK.
          KBBQQK..KQQPPK
          KBQQQK..KQQPPK
          KBQQQK..KQQPPK
          KBQQQK..KQQPPK
          KBQQQK..KQQPPK
          KBQQQK..KQPPPK
          KQQQQK..KQPPPK
          KQQPPK..KPPPPK
          .KKKK....KKKK.
        `,
        up: `
          .KKKKKKKKKKKK.
          KBBBBQQQQQQPPK
          KBQQQQQQQQQPPK
          KBQQQQQQQQQPPK
          KBQQQQQQQQPPPK
          KBQQQQQQQQPPPK
          KQQQQQQQQQPPPK
          KQQQQQQQQPPPPK
          KQQQQQQQPPPPPK
          .KKKKKKKKKKKK.
        `,
        side: `
          .KKKKK.
          KBBQQPK
          KBQQQPK
          KBQQQPK
          KBQQQPK
          KQQQQPK
          KQQQPPK
          KQQQPPK
          KQQPPPK
          .KKKKK.
        `,
      },
    },
  }),
);

/** 학사모: a mortarboard, tassel to the right. Bought by first-years three years early. */
export const gradcap = withKo(
  part({
    palette: gear,
    lone,
    pieces: {
      head: {
        at: { down: [3, 1], up: [3, 1], side: [2, 1] },
        down: `
          ........ee........
          .....eeeIIeee.....
          ..eeeIIIIiiiieee..
          eeiiiiiiiiiiiiiiee
          ..eeeiiiiiizzeeD..
          ....eezzzzzzeeDaD.
          ..............DaD.
          ...............D..
        `,
        up: `
          ........ee........
          .....eeeIIeee.....
          ..eeeIIiiiiiieee..
          eeiiiiiiiiiiiiiiee
          ..Deeiiiiiizzeee..
          .DaDeezzzzzzee....
          .DaD..............
          ..D...............
        `,
        side: `
          .....eeeeeeeeeeee..
          ...eeIIiiiiiiiiiiee
          ..D..eezzzzzzzzee..
          .DaD..eezzzzzzee...
          .DaD...............
          ..D................
        `,
      },
    },
  }),
);

/** 해솔제 머리띠: the festival band, white with the school's red sun, knot at the back. */
export const headband = withKo(
  part({
    palette: gear,
    lone,
    pieces: {
      head: {
        at: { down: [4, 4], up: [4, 4], side: [1, 4] },
        down: `
          GGGGGGGGGGGGGGGG
          GwwwwwwmmwwwwwwG
          GqqqqqqrrqqqqqqG
        `,
        up: `
          GGGGGGGGGGGGGGGG
          GwwwwwwwwwwwwwwG
          GqqqqqqGGqqqqqqG
          ......GwwG......
          .....GwqqG......
          .....GGGGG......
        `,
        side: `
          ....GGGGGGGGGGGGG
          GG..GwwwwwwwwwwwG
          GwGGGqqqqqqqqqqqG
          GwwG.............
          GqqG.............
          GGG..............
        `,
      },
    },
  }),
);

/** 엔트로피 팬클럽 고양이 귀: one black ear and one orange, as on the cat. */
export const catears = withKo(
  part({
    palette: gear,
    lone,
    pieces: {
      head: {
        at: { down: [5, 1], up: [5, 1], side: [6, 1] },
        down: `
          ..e........T..
          .eze......TuT.
          .eze......TuT.
          .eee......TTT.
        `,
        up: `
          ..T........e..
          .TuT......eze.
          .TuT......eze.
          .TTT......eee.
        `,
        side: `
          .T..e...
          TuTeze..
          TuTeze..
          TTTeee..
        `,
      },
    },
  }),
);

/** 층장 완장: a red band round the left arm, worn for the week the floor elected you. */
function armband(): PartDef {
  const dirs = ["down", "up"] as const;
  const band = (grid: string): string => {
    const rows = gridRows(grid).map((r) => [...r]);
    const fill = rows
      .map((r, y) => (r.some((c) => c === "2" || c === "3") ? y : -1))
      .filter((y) => y >= 0);
    const pick = fill[Math.floor((fill.length - 1) / 2)] ?? -1;
    const paint = (c: string, y: number): string => {
      if (y === pick) return c === "1" ? "R" : c === "2" ? "m" : c === "3" ? "r" : ".";
      if (y === pick + 1) return c === "1" ? "D" : c === "2" ? "A" : c === "3" ? "a" : ".";
      return ".";
    };
    return rows.map((r, y) => r.map((c) => paint(c, y)).join("")).join("\n");
  };
  const arm = armL;
  const poses = (dir: (typeof dirs)[number]) => {
    const src = arm[dir];
    const map = typeof src === "string" ? { rest: src } : (src ?? {});
    return Object.fromEntries(
      Object.entries(map).map(([pose, g]) => {
        if (typeof g === "string") return [pose, g === "." ? "." : band(g)];
        return [pose, { at: g.at, grid: band(g.grid) }];
      }),
    );
  };
  return withKo(
    part({
      palette: gear,
      lone: "RmrDAa",
      under: "hair",
      pieces: {
        armL: {
          at: (arm.at as Partial<Record<Dir, Vec>>) ?? [0, 0],
          down: { ...poses("down"), fold: ".", floor: "." },
          up: poses("up"),
          side: null,
        },
      },
    }),
  );
}
export const sash = armband();

/** 올리브 관: Page 1's 탐구 상점 prize, cut from the grove behind the Lyceum. */
export const wreath = withKo(
  part({
    palette: gear,
    lone,
    pieces: {
      head: {
        at: { down: [4, 3], up: [4, 3], side: [3, 3] },
        down: `
          ..FFFF....FFFF..
          .FZZooF..FooooF.
          FZZooF....FoooFF
          FooF........FooF
          .FF..........FF.
        `,
        up: `
          ..FFFFFFFFFFFF..
          .FZZooZZooZZooF.
          FZZooZZooZZooooF
          FooF........FooF
          .FF..........FF.
        `,
        side: `
          ..FFFFFFFFF....
          .FZZooZZoooF...
          FZZooZZoooFF...
          FooF.....FooF..
          .FF.......FF...
        `,
      },
    },
  }),
);

const tortoiseGrid = `
  ...WWWW....
  ..WUUuuW.FF
  .WUuuuttWo*
  WWWWWWWWWoF
  .FF...FF.F.
`;

/** 제논의 거북이: the tortoise nobody could catch, now riding on your head. Zeno's prize. */
export const tortoise = withKo(
  part({
    palette: { ...gear, o: "olive.mid", Z: "olive.light", F: "olive.deep", f: "olive.dark" },
    lone,
    pieces: {
      head: {
        at: { down: [7, 1], up: [6, 1], side: [6, 1] },
        down: tortoiseGrid,
        up: mirror(tortoiseGrid),
        side: tortoiseGrid,
      },
    },
  }),
);
