import { body, disc, grid, mask, over, stack } from "../../draw.ts";
import { sprite } from "../../format.ts";
import { UI } from "../../ui-legend.ts";

/**
 * Icons. 12×12 for currencies, stats and HUD markers; 16×16 for menu entries and the five
 * class emblems. Every one is a thing from school: a whistle for 벌점, a set square for 수학.
 */
const ui = { group: "ui", origin: [0, 0], anim: {} } as const;

const ICON = {
  ...UI,
  // Wood, for the pine cone and cork.
  a: "wood.deep",
  c: "wood.dark",
  C: "wood.mid",
  E: "wood.light",
  Z: "wood.pale",
  // Clay, for bronze.
  K: "clay.dark",
  L: "clay.mid",
  M: "clay.light",
  Q: "clay.pale",
  // Grass, sea, plum.
  F: "grass.deep",
  f: "grass.dark",
  h: "grass.mid",
  H: "grass.light",
  j: "grass.pale",
  "1": "sea.deep",
  "2": "sea.dark",
  "3": "sea.mid",
  "4": "sea.light",
  "5": "sea.pale",
  "6": "plum.deep",
  "7": "plum.dark",
  "8": "plum.mid",
  "9": "plum.light",
  "0": "plum.pale",
  // Faces: clay stands in for skin, since skin names address the swap slot.
  i: "clay.dark",
  v: "clay.pale",
  V: "clay.light",
  // Lone details.
  "*": "stone.bright",
  "+": "gold.pale",
  "%": "clay.pale",
  "!": "red.mid",
  "?": "red.light",
  w: "stone.bright",
  q: "ink.dark",
  z: "stone.mid",
} as const;
const LONE = "*+%!?wqz";

// 12×12 -----------------------------------------------------------------------------------

const S12 = 12;
const round12 = (x: number, y: number) => Math.hypot(x + 0.5 - 6, y + 0.5 - 6) < 5.9;

const icon = sprite({
  ...ui,
  name: "icon",
  size: [S12, S12],
  palette: ICON,
  lone: LONE,
  frames: {
    /** 솔방울: a cone of the 해솔, the school's black pine, still on its twig of needles. */
    pinecone: stack(
      ".....F..F...",
      "......FF....",
      "....aaaaa...",
      "...aEZcEZa..",
      "..aEZcEZcZa.",
      "..acEZcEZca.",
      ".aEZcEZcEZca",
      ".aaEZcEZcEa.",
      "..aEZcEZcca.",
      "..aaEZcEZa..",
      "...aEZcca...",
      "....aaaa....",
    ),
    /** 상점: a gold praise sticker. */
    merit: body(
      S12,
      S12,
      mask(
        stack(
          ".....##.....",
          "....####....",
          "....####....",
          "############",
          "############",
          ".##########.",
          "..########..",
          "..########..",
          ".####..####.",
          ".###....###.",
          "###......###",
          "............",
        ),
      ),
      { line: "u", light: "y", mid: "Y", dark: "g" },
    ),
    /** 탐구 토큰: a bronze coin stamped with a magnifier. */
    token: over(
      body(S12, S12, round12, { line: "X", light: "M", mid: "L", dark: "K" }),
      stack(".%%..", "%MM%.", "%MM%.", ".%%%.", "....%"),
      3,
      3,
    ),
    /** 낱장: a page torn from a notebook. */
    page: stack(
      ".oooooooo...",
      ".oWWWWWWso..",
      "..oWWWWWWso.",
      ".oWsssssWWo.",
      ".oWWWWWWWWo.",
      "..oWsssssWo.",
      ".oWWWWWWWWo.",
      "..oWsssssWo.",
      ".oWWWWWWWWo.",
      "..oWssssWWo.",
      ".oWWWWWWWWo.",
      "..oooooooo..",
    ),
    /** 잉크: a bottle of navy ink with a paper label. */
    ink: stack(
      "....oooo....",
      "....ommo....",
      "...oooooo...",
      "....oBbo....",
      "..ooBnnboo..",
      ".obnnnnnnNo.",
      ".obWWWWWWNo.",
      ".obWkkkWWNo.",
      ".obWWWWWWNo.",
      ".obnnnnnnNo.",
      ".oNNNNNNNNo.",
      "..oooooooo..",
    ),
    /** 벌점: 권 사감's whistle on its red cord. */
    whistle: over(
      body(
        S12,
        S12,
        mask(
          stack(
            "............",
            "............",
            "............",
            "......####..",
            ".....######.",
            "###########.",
            "############",
            "############",
            "######.#####",
            "......#####.",
            ".......###..",
            "............",
          ),
        ),
        { line: "o", light: "W", mid: "p", dark: "S" },
      ),
      stack("............", "..........!.", "........!..?", "........o..?", "..........?."),
    ),
    /** 자습 pool: an hourglass filling while you are away. */
    pool: stack(
      ".oooooooooo.",
      ".oEEEEEEEEo.",
      ".oCCCCCCCCo.",
      "..oWppppWo..",
      "..oWYYYYWo..",
      "...oWYYWo...",
      "....oYYo....",
      "...oWpYWo...",
      "..oWpYYYWo..",
      "..oYYYYYYo..",
      ".oCCCCCCCCo.",
      ".oooooooooo.",
    ),
    /** 이해력: a bulb going on. */
    insight: stack(
      "....oooo....",
      "...oyyyYo...",
      "..oy+yYYgo..",
      "..oyyYYYgo..",
      "..oyYYYggo..",
      "...oYYggo...",
      "....oYgo....",
      "....oSSo....",
      "....oddo....",
      "....oSSo....",
      ".....oo.....",
      "............",
    ),
    /** 암기력: a ring of word cards. */
    memory: stack(
      ".ooo........",
      "o...o.......",
      "o.oooooooo..",
      ".ooWWWWWWWo.",
      "..oWsssssWo.",
      "..oWWWWWWWo.",
      "..oWssssWWo.",
      "..oWWWWWWWo.",
      "..opppppppo.",
      "..oSSSSSSSo.",
      "..oooooooo..",
      "............",
    ),
    /** 집중력: a target. */
    focus: disc(
      S12,
      [
        [1, "X"],
        [2, "r"],
        [1, "W"],
        [1, "r"],
      ],
      "W",
    ),
    /** 체력: a heart. */
    stamina: over(
      body(
        S12,
        S12,
        mask(
          stack(
            "............",
            ".####..####.",
            "############",
            "############",
            "############",
            "############",
            ".##########.",
            "..########..",
            "...######...",
            "....####....",
            ".....##.....",
            "............",
          ),
        ),
        { line: "X", light: "R", mid: "r", dark: "x" },
      ),
      stack("...", "...", "..*"),
    ),
    /** 순발력: a running shoe. */
    agility: stack(
      "............",
      "............",
      "..oooo......",
      ".oRRRRo.....",
      ".oRWWRRo....",
      ".oRRWWRRoo..",
      ".oRRRWWRRRo.",
      ".oRRRRRRRRRo",
      ".oxxxxxxxxxo",
      ".oWWWWWWWWWo",
      "..ooooooooo.",
      "............",
    ),
    /** 운: a four-leaf clover. */
    luck: over(
      body(
        S12,
        S12,
        mask(
          stack(
            ".###...###..",
            "#####.#####.",
            "#####.#####.",
            "############",
            ".##########.",
            "...######...",
            ".##########.",
            "############",
            "#####.#####.",
            "#####.#####.",
            ".###...###..",
            "............",
          ),
        ),
        { line: "F", light: "H", mid: "h", dark: "f" },
        0.3,
      ),
      stack("......"),
    ),
    /** Chat, collapsed: a speech bubble. */
    chat: stack(
      "............",
      ".oooooooooo.",
      "oWWWWWWWWWWo",
      "oWqqqWqqWWWo",
      "oWWWWWWWWWpo",
      "oWqqWqqqqWpo",
      "oWWWWWWWWppo",
      ".ooWWoooooo.",
      "..oWo.......",
      "..oo........",
      "............",
      "............",
    ),
  },
});

// 16×16 -----------------------------------------------------------------------------------

const S16 = 16;

/**
 * A pencil lying corner to corner, eraser up and to the right. Each row is the same five-pixel
 * cross-section shifted one pixel, so every colour runs as a diagonal line.
 */
const SECTIONS: readonly (readonly [string, number])[] = [
  ["ooo", 1],
  ["eRr", 2],
  ["WSd", 2],
  ["yYg", 6],
  ["ZEC", 2],
];
const pencil = grid(S16, S16, (x, y) => {
  const start = 12 - y;
  const k = x - start;
  let row = 0;
  for (const [inner, n] of SECTIONS) {
    if (y < row + n) {
      if (k === 0 || k === 4) return "o";
      return k > 0 && k < 4 ? (inner[k - 1] ?? ".") : ".";
    }
    row += n;
  }
  // The sharpened tip: graphite narrowing to a point.
  if (y === row) return k === 1 || k === 4 ? "o" : k === 2 || k === 3 ? "k" : ".";
  if (y === row + 1) return k >= 2 && k <= 4 ? "o" : ".";
  return ".";
});

const menu = sprite({
  ...ui,
  name: "menu",
  size: [S16, S16],
  palette: ICON,
  lone: LONE,
  frames: {
    /** 가방 */
    bag: stack(
      "................",
      "......oooo......",
      ".....o....o.....",
      "...oooooooooo...",
      "..obbbbbbbbbbo..",
      "..obnnnnnnnnNo..",
      "..obnnnnnnnnNo..",
      "..oNNNNNNNNNNo..",
      "..obnnnyynnnNo..",
      "..obnoooooonNo..",
      "..obnobbbbonNo..",
      "..obnobnnnonNo..",
      "..obnooooooNNo..",
      "..oNNNNNNNNNNo..",
      "...oooooooooo...",
      "................",
    ),
    /** 장비: a pencil, sharpened. */
    gear: pencil,
    /** 캐릭터: the student ID card. */
    card: stack(
      "................",
      "................",
      ".oooooooooooooo.",
      ".obbbbbbbbbbbbo.",
      ".onnnnnnnnnnnno.",
      ".oWoooooWWWWWWo.",
      ".oWoVvvoWqqqqWo.",
      ".oWovVvoWWWWWWo.",
      ".oWonnnoWqqqWWo.",
      ".oWoooooWWWWWWo.",
      ".oWWWWWWWWWWWWo.",
      ".oppppppppppppo.",
      ".oooooooooooooo.",
      "................",
      "................",
      "................",
    ),
    /** 수행평가: a clipboard with a checklist. */
    quests: stack(
      ".....oooooo.....",
      "..oooSSSSSSooo..",
      ".oCCodddddoCCCo.",
      ".oCWooooooooWCo.",
      ".oCWWWWWWWWWWCo.",
      ".oCWW!WssssWWCo.",
      ".oCW!WWWWWWWWCo.",
      ".oCWWWWWWWWWWCo.",
      ".oCWW!WssssWWCo.",
      ".oCW!WWWWWWWWCo.",
      ".oCWWWWWWWWWWCo.",
      ".oCWWWWssssWWCo.",
      ".oCWWWWWWWWWWCo.",
      ".oCccccccccccco.",
      "..oooooooooooo..",
      "................",
    ),
    /** 연구노트: the 0조 notebook, spiral bound, a red line on its label. */
    notebook: stack(
      "..z.z.z.z.z.z...",
      "..z.z.z.z.z.z...",
      ".oooooooooooooo.",
      ".obbbbbbbbbbbNo.",
      ".obnnnnnnnnnnNo.",
      ".obnnnnnnnnnnNo.",
      ".obnnoooooonnNo.",
      ".obnnoWWWWonnNo.",
      ".obnnorrrronnNo.",
      ".obnnoWWWWonnNo.",
      ".obnnoooooonnNo.",
      ".obnnnnnnnnnnNo.",
      ".obnnnnnnnnnnNo.",
      ".oNNNNNNNNNNNNo.",
      "..oooooooooooo..",
      "................",
    ),
    /** 도감: a fat book from the 물음표 서고. */
    codex: stack(
      "................",
      "..ooooooooooo...",
      ".ofHHHHHHHHHHo..",
      ".ofHhhhhhhhhhoo.",
      ".ofHhhyyyyhhhoWo",
      ".ofHhyyhhyyhhoWo",
      ".ofHhhhhhyyhhoWo",
      ".ofHhhhhyyhhhoWo",
      ".ofHhhhyyhhhhoWo",
      ".ofHhhhyyhhhhoWo",
      ".ofHhhhhhhhhhoWo",
      ".ofHhhhyyhhhhoso",
      ".ofHhhhhhhhhhoso",
      ".offfffffffffoso",
      "..ooooooooooooo.",
      "................",
    ),
    /** 동아리: a club pennant. */
    club: stack(
      "................",
      ".oo.............",
      ".oSoooo.........",
      ".oSoRRRooo......",
      ".oSoRRRRRRooo...",
      ".oSoRWWWWRRRRoo.",
      ".oSoRRRRRRrrrro.",
      ".oSorrrrrroooo..",
      ".oSoxxxoooo.....",
      ".oSoooo.........",
      ".oSo............",
      ".oSo............",
      ".oSo............",
      ".odo............",
      ".odo............",
      "..o.............",
    ),
    /** 매점 게시판: the corkboard everyone pretends is a shop. */
    board: stack(
      "................",
      ".oooooooooooooo.",
      ".oEEEEEEEEEEEEo.",
      ".oECCCCCCCCCCco.",
      ".oECoooooCoooco.",
      ".oECoW!WoCoyyco.",
      ".oECoWWWoCoyyco.",
      ".oECoWqWoCoyyco.",
      ".oECoWWWoCoooco.",
      ".oECooooCCCCCco.",
      ".oECCCCooooCCco.",
      ".oECCCCoW!WoCco.",
      ".oECCCCoWWWoCco.",
      ".occcccooooocco.",
      ".oooooooooooooo.",
      "................",
    ),
    /** 친구: two classmates. */
    friends: stack(
      "................",
      "................",
      "..oooo....oooo..",
      ".ommmmo..occcco.",
      ".ommmmo..occcco.",
      ".oQQQMo..oQQQMo.",
      ".oQQQMo..oQQQMo.",
      "..oQMo....oQMo..",
      ".oooooo..oooooo.",
      "osSSSSdoobnnnnNo",
      "osSSSSdoobnnnnNo",
      "osSSSSdoobnnnnNo",
      "oooooooooooooooo",
      "................",
      "................",
      "................",
    ),
    /** 설정: a cog. */
    settings: over(
      body(
        S16,
        S16,
        (x, y) => {
          const dx = x + 0.5 - 8;
          const dy = y + 0.5 - 8;
          const r = Math.hypot(dx, dy);
          const a = Math.atan2(dy, dx);
          const tooth = Math.cos(a * 8) > 0.3;
          return r < (tooth ? 7.6 : 5.9) && r > 2.2;
        },
        { line: "o", light: "p", mid: "s", dark: "S" },
      ),
      stack("................"),
    ),
  },
});

/** Class emblems: round embroidered patches, each in its subject's colour. */
function patch(
  line: string,
  light: string,
  mid: string,
  dark: string,
  symbol: string,
  at: number,
): string {
  return over(
    disc(
      S16,
      [
        [1, line],
        [1, (t) => (t > 0.7 || t < 0.2 ? light : dark)],
      ],
      mid,
    ),
    symbol,
    at,
    at,
  );
}

const emblem = sprite({
  ...ui,
  name: "emblem",
  size: [S16, S16],
  palette: ICON,
  lone: LONE,
  frames: {
    /** 수학: a set square. */
    math: patch(
      "k",
      "b",
      "n",
      "N",
      stack(
        "w.......",
        "ww......",
        "www.....",
        "w.ww....",
        "w..ww...",
        "w...ww..",
        "wwwwwww.",
        "wwwwwwww",
      ),
      4,
    ),
    /** 물리: a horseshoe magnet. */
    physics: patch(
      "X",
      "R",
      "r",
      "x",
      stack("ww...ww", "ww...ww", "ww...ww", "ww...ww", "www.www", ".wwwww.", "..www.."),
      4,
    ),
    /** 화학: an Erlenmeyer flask. */
    chemistry: patch(
      "1",
      "4",
      "3",
      "2",
      stack("..www..", "..w.w..", "..w.w..", ".w...w.", ".wwwww.", "wwwwwww", "wwwwwww"),
      4,
    ),
    /** 생명: a leaf and its midrib. */
    biology: patch(
      "F",
      "H",
      "h",
      "f",
      stack("....www", "..wwwww", ".www.ww", ".ww.www", "ww.www.", "w.ww...", "w......"),
      4,
    ),
    /** 지구과학: a planet and its ring. */
    earth: patch(
      "u",
      "Y",
      "g",
      "G",
      stack("..w.....", ".www..w.", ".www.www", "wwwwwwww", "wwwwwwww"),
      4,
    ),
  },
});

export default [icon, menu, emblem];
