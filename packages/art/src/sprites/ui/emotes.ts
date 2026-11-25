import { cells, grid, stack } from "../../draw.ts";
import { sprite } from "../../format.ts";
import { UI } from "../../ui-legend.ts";

/**
 * Emote icons (PLAN §12): the wheel of eight at 16×16, in the menu icons' style, and the
 * bubble over a character's head at 12×12, two frames each. Frame and animation names are the
 * emote ids: hello, clap, lol, sleepy, fighting, bow, dance, panic. The character half of each
 * emote is the student rig's animation of the same name.
 */
const LEGEND = {
  ...UI,
  // Skin, as in the menu icons: clay stands in, since skin names address the swap slot.
  i: "clay.dark",
  V: "clay.light",
  v: "clay.pale",
  // Sweat.
  c: "sea.mid",
  C: "sea.light",
  // Lone sparkles.
  "*": "stone.bright",
  "+": "gold.pale",
  "!": "red.mid",
} as const;
const LONE = "*+!";

/**
 * Draws the ink outline: every clear pixel touching a filled one (sparkles aside) becomes `o`.
 * Icons are drawn as fills; the outline is never hand-placed, so it is always closed.
 */
function inked(src: string): string {
  const m = cells(src);
  const h = m.length;
  const w = m[0]?.length ?? 0;
  const solid = (x: number, y: number) => {
    const c = m[y]?.[x];
    return c !== undefined && c !== "." && !LONE.includes(c) && c !== "o";
  };
  return grid(w, h, (x, y) => {
    const c = m[y]?.[x] ?? ".";
    if (c !== ".") return c;
    const near = [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => solid(x + dx, y + dy)));
    return near ? "o" : ".";
  });
}

const ui = { group: "ui", origin: [0, 0] } as const;

/** A ㅋ in red pen, 5×7. */
const kieuk = ["RRRRx", "....x", "RRRRx", "....x", "....x", "....x", "...xx"];

const emote = sprite({
  ...ui,
  name: "emote",
  size: [16, 16],
  palette: LEGEND,
  lone: LONE,
  anim: {},
  frames: {
    /** 인사: a hand up, mid-wave. */
    hello: inked(
      stack(
        "................",
        "................",
        "......v..v......",
        "......v..v...+..",
        "...v..vV.vV.....",
        "...vV.vV.vV.v...",
        "....vVvVVvVvV.+.",
        "....vVVVVVVVV...",
        "....vvVVVVVVV...",
        ".....vVVVVVVi...",
        ".....vVVVVVi....",
        "......iVVVii....",
        ".......iiii.....",
        "................",
        "................",
        "................",
      ),
    ),
    /** 박수: two palms meeting. */
    clap: inked(
      stack(
        "................",
        ".+............+.",
        "................",
        "......v..v......",
        ".....vV..Vv.....",
        "....vVV..VVv....",
        "....vVV..VVv....",
        "....vVV..VVv....",
        "....vVV..VVv....",
        ".....iV..Vi.....",
        ".....ii..ii.....",
        "................",
        "..+..........+..",
        "................",
        "................",
        "................",
      ),
    ),
    /** ㅋㅋ: two ㅋ in red pen. */
    lol: inked(
      stack(
        "................",
        "................",
        "................",
        "................",
        ...kieuk.map((r) => `..${r}..${r}..`),
        "................",
        "................",
        "................",
        "................",
        "................",
      ),
    ),
    /** 졸림: Z and z, drifting up. */
    sleepy: inked(
      stack(
        "................",
        "................",
        "...........WWW..",
        "............W...",
        "...........WWW..",
        "................",
        "...WWWWW........",
        "......WW........",
        ".....WW.........",
        "....WW..........",
        "...WWWWW........",
        "...ppppp........",
        "................",
        "................",
        "................",
        "................",
      ),
    ),
    /** 화이팅: a fist up. */
    fighting: inked(
      stack(
        "................",
        "................",
        "....vvvvv....+..",
        "...vvvvvvV......",
        "...VVVVVVV......",
        "...vvvvvvV......",
        "...VVVVVVi......",
        "....VVVVVi......",
        "....iiiii.......",
        ".....NNnN.......",
        ".....nnnN.......",
        ".....nnnN.......",
        "................",
        "................",
        "................",
        "................",
      ),
    ),
    /** 절: seen from in front, the crown of a head bowed to the floor between two hands. */
    bow: inked(
      stack(
        "................",
        "................",
        "................",
        "................",
        "......kkkk......",
        ".....kmkkkk.....",
        "....kmkkkkkk....",
        "....kkkkkkkk....",
        "..bnnkkkkkknnN..",
        ".bnnVVkkkkVVnnN.",
        ".nn..VVVVVV..nN.",
        "................",
        "..SSSSSSSSSSSS..",
        "................",
        "................",
        "................",
      ),
    ),
    /** 춤: two notes. */
    dance: inked(
      stack(
        "................",
        "................",
        "........GGGGGG..",
        "........GG..GG..",
        "........G....G..",
        "........G....G..",
        "........G....G..",
        "........G....G..",
        "....YYYYG..YYG..",
        "...YYYYYG.YYYY..",
        "...YYYYY..YYYY..",
        "....YYY....YY...",
        "................",
        "................",
        "................",
        "................",
      ),
    ),
    /** 멘붕: D-1 on the calendar and the 수행평가 not started. */
    panic: stack(
      "...o.......o....",
      "..o*o.....o*o...",
      ".oooooooooooooo.",
      ".oxxxxxxxxxxxxo.",
      ".orrrrrrrrrrrro.",
      ".oooooooooooooo.",
      ".oWWWWWWWWWWWWo.",
      ".oWooWWWWWWoWWo.",
      ".oWoWoWWWWooWWo.",
      ".oWoWoWoooWoWWo.",
      ".oWoWoWWWWWoWWo.",
      ".oWooWWWWWWoWWo.",
      ".oWWWWWWWWWWWWo.",
      ".oppppppppppppo.",
      ".oooooooooooooo.",
      "................",
    ),
  },
});

const bubble = sprite({
  ...ui,
  name: "emote-bubble",
  size: [12, 12],
  palette: LEGEND,
  lone: LONE,
  frames: {
    hello0: inked(
      stack(
        "............",
        "....v.v.....",
        "..v.v.v.....",
        "..vVvVvV....",
        "..vVvVvV....",
        "...VVVVVV...",
        "...VVVVVi...",
        "....VVVi....",
        "....iii.....",
        "............",
        "............",
        "............",
      ),
    ),
    hello1: inked(
      stack(
        "............",
        ".....v.v....",
        "...v.v.v....",
        "...vVvVvV...",
        "...vVvVvV...",
        "....VVVVVV..",
        "....VVVVVi..",
        ".....VVVi...",
        ".....iii....",
        "............",
        "............",
        "............",
      ),
    ),
    clap0: inked(
      stack(
        "............",
        "............",
        "..vV....Vv..",
        "..vV....Vv..",
        "..vV....Vv..",
        "..iV....Vi..",
        "..ii....ii..",
        "............",
        "............",
        "............",
        "............",
        "............",
      ),
    ),
    clap1: inked(
      stack(
        "+..........+",
        "............",
        "....vVVv....",
        "....vVVv....",
        "....vVVv....",
        "....iVVi....",
        "....iiii....",
        "............",
        "+..........+",
        "............",
        "............",
        "............",
      ),
    ),
    lol0: inked(
      stack(
        "............",
        "............",
        ".RRRx.RRRx..",
        "....x....x..",
        ".RRRx.RRRx..",
        "....x....x..",
        "...xx...xx..",
        "............",
        "............",
        "............",
        "............",
        "............",
      ),
    ),
    lol1: inked(
      stack(
        "............",
        "..RRRx.RRRx.",
        ".....x....x.",
        "..RRRx.RRRx.",
        ".....x....x.",
        "....xx...xx.",
        "............",
        "............",
        "............",
        "............",
        "............",
        "............",
      ),
    ),
    sleepy0: inked(
      stack(
        "............",
        "............",
        "............",
        "......WW....",
        ".......W....",
        "..WWWWWW....",
        "....WW......",
        "...WW.......",
        "..WWWW......",
        "............",
        "............",
        "............",
      ),
    ),
    sleepy1: inked(
      stack(
        "............",
        "......WWW...",
        ".......W....",
        "......WWW...",
        "............",
        "..WWWW......",
        "....WW......",
        "...WW.......",
        "..WWWW......",
        "............",
        "............",
        "............",
      ),
    ),
    fighting0: inked(
      stack(
        "............",
        "............",
        "..vvvvv.....",
        "..VVVVVV....",
        "..vvvvvV....",
        "..VVVVVi....",
        "...iiii.....",
        "...NnnN.....",
        "...NnnN.....",
        "............",
        "............",
        "............",
      ),
    ),
    fighting1: inked(
      stack(
        "+.......+...",
        "..vvvvv.....",
        "..VVVVVV....",
        "..vvvvvV....",
        "..VVVVVi....",
        "...iiii.....",
        "...NnnN.....",
        "...NnnN.....",
        "............",
        "............",
        "............",
        "............",
      ),
    ),
    bow0: inked(
      stack(
        "............",
        "............",
        "............",
        "....bbnn....",
        "..bbnnnnNN..",
        ".bnnnnnnkk..",
        ".kknnnnkkk..",
        ".kk...VVk...",
        "............",
        ".SSSSSSSSS..",
        "............",
        "............",
      ),
    ),
    bow1: inked(
      stack(
        "............",
        "............",
        "............",
        "............",
        "...bbnnNN...",
        ".bbnnnnnkk..",
        ".kknnnnkkk..",
        ".kk...VVk...",
        "............",
        ".SSSSSSSSS..",
        "............",
        "............",
      ),
    ),
    dance0: inked(
      stack(
        "............",
        "......GGG...",
        "......G.....",
        "......G.....",
        "......G.....",
        "...YYYG.....",
        "..YYYYG.....",
        "..YYYY......",
        "............",
        "............",
        "............",
        "............",
      ),
    ),
    dance1: inked(
      stack(
        "............",
        "............",
        "....GGGGGG..",
        "....G....G..",
        "....G....G..",
        "..YYG..YYG..",
        ".YYYG.YYYG..",
        ".YYY..YYY...",
        "............",
        "............",
        "............",
        "............",
      ),
    ),
    panic0: inked(
      stack(
        "............",
        "....C.......",
        "...CC....!..",
        "..CCCc...!..",
        "..CCcc...!..",
        "...cc.......",
        ".........!..",
        "............",
        "............",
        "............",
        "............",
        "............",
      ),
    ),
    panic1: inked(
      stack(
        "............",
        "............",
        ".....C...!..",
        "....CC...!..",
        "...CCCc..!..",
        "...CCcc.....",
        "....cc...!..",
        "............",
        "............",
        "............",
        "............",
        "............",
      ),
    ),
  },
  anim: {
    hello: { frames: ["hello0", "hello1"], fps: 4 },
    clap: { frames: ["clap0", "clap1"], fps: 6 },
    lol: { frames: ["lol0", "lol1"], fps: 6 },
    sleepy: { frames: ["sleepy0", "sleepy1"], fps: 2 },
    fighting: { frames: ["fighting0", "fighting1"], fps: 4 },
    bow: { frames: ["bow0", "bow1"], fps: 2 },
    dance: { frames: ["dance0", "dance1"], fps: 4 },
    panic: { frames: ["panic0", "panic1"], fps: 6 },
  },
});

export default [emote, bubble];
