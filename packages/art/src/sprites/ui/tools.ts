import { stack } from "../../draw.ts";
import { sprite } from "../../format.ts";
import { clean, grow, line, Pic, put } from "../../fx.ts";
import { seal } from "../../paint.ts";
import { UI } from "../../ui-legend.ts";

/**
 * Tools, the passives linked to the launch books: 16×16, drawn to sit inside an item slot like
 * a book cover. Each is the real instrument from a science classroom, in ink outline with the
 * kit's light from the top left.
 */
const ui = { group: "ui", origin: [0, 0], anim: {} } as const;

const TOOL = {
  ...UI,
  // Sea, for glass and lamp fuel.
  "1": "sea.deep",
  "3": "sea.mid",
  "4": "sea.light",
  "5": "sea.pale",
  // Grass, for grips.
  F: "grass.deep",
  h: "grass.mid",
  H: "grass.light",
  // Wood, for handles and the drum.
  a: "wood.deep",
  c: "wood.dark",
  C: "wood.mid",
  E: "wood.light",
  // Plum, sea dark and grass dark and pale, for the newer tools.
  "6": "plum.deep",
  "7": "plum.dark",
  "8": "plum.mid",
  "9": "plum.light",
  "0": "plum.pale",
  "2": "sea.dark",
  f: "grass.dark",
  j: "grass.pale",
  // Ink pips.
  q: "ink.dark",
  // Clay.
  K: "clay.dark",
  L: "clay.mid",
  M: "clay.light",
  Q: "clay.pale",
  // Lone glints.
  "*": "stone.bright",
} as const;

/** Two-pixel legs drawn row by row, then ringed in ink. */
function compass(): string {
  const pic = Pic.blank(16, 16);
  put(pic, "nn\nNN", 7, 1);
  for (let r = 0; r < 9; r++) put(pic, "Sd", 6 - Math.floor(r / 2), 3 + r);
  put(pic, "S", 2, 12);
  for (let r = 0; r < 8; r++) put(pic, "Sd", 8 + Math.floor(r / 2), 3 + r);
  put(pic, "yG\nGG", 12, 11);
  put(pic, "W", 3, 11);
  return grow(pic, "nNSdyGW", "o").toString();
}

function tweezers(): string {
  const pic = Pic.blank(16, 16);
  for (let r = 0; r < 11; r++) {
    const grip = r >= 3 && r <= 6;
    put(pic, grip ? "hH" : "Sd", 12 - r, 2 + r);
    put(pic, grip ? "hH" : "Sd", 13 - Math.round(r * 0.8), 3 + r);
  }
  put(pic, "SS", 12, 1);
  return clean(grow(pic, "SdhH", "o"), "o").toString();
}

/**
 * A tool drawn as fills only: every pixel on its silhouette (and round any hole) turns to ink,
 * and stray single pixels fold into their neighbours. Rows and columns short of 16 are padded.
 */
function sealed(...rows: string[]): string {
  const full = [...rows, ...Array.from({ length: 16 - rows.length }, () => "")];
  const pic = Pic.of(full.map((r) => r.padEnd(16, ".")).join("\n"));
  return clean(seal(pic, "o", "*"), "*Wy5o").toString();
}

/** A pen, a pipette or a handle: a thick stroke lit on its upper-left side. */
function stroke(
  pic: Pic,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  light: string,
  mid: string,
  dark: string,
): Pic {
  line(pic, x0 - 1, y0, x1 - 1, y1, light);
  line(pic, x0, y0, x1, y1, mid);
  line(pic, x0, y0 + 1, x1, y1 + 1, dark);
  return pic;
}

const MATH_TOOLS = {
  /** 계산기: navy body, a green readout, three rows of keys and a red one. */
  calculator: sealed(
    "",
    "..oooooooooooo",
    ".obbbbbbbbbbbbo",
    ".obHHHHHHHHHHno",
    ".obHFFHFFHFFHno",
    ".obHHHHHHHHHHno",
    ".onnnnnnnnnnnno",
    ".onWWnWWnWWnRRo",
    ".onssnssnssnxxo",
    ".onnnnnnnnnnnno",
    ".onWWnWWnWWnRRo",
    ".onssnssnssnxxo",
    ".onnnnnnnnnnnno",
    ".oNNNNNNNNNNNNo",
    "..oooooooooooo",
  ),
  /** 주사위: a white die on five, its shaded front below. */
  dice: sealed(
    "",
    "..oooooooooooo",
    ".oWWWWWWWWWWWso",
    ".oWqqWWWWWWqqso",
    ".oWqqWWWWWWqqso",
    ".oWWWWWWWWWWWso",
    ".oWWWWWqqWWWWso",
    ".oWWWWWqqWWWWso",
    ".oWWWWWWWWWWWso",
    ".oWqqWWWWWWqqso",
    ".oWqqWWWWWWqqso",
    ".oWWWWWWWWWWWso",
    ".osssssssssssso",
    ".oSSSSSSSSSSSSo",
    "..oooooooooooo",
  ),
  /** 삼각자: a clear navy set square, its window cut out, ticks on the long edge. */
  "set-square": sealed(
    "",
    ".BB",
    ".BbB",
    ".BbbB",
    ".BbBbB",
    ".BbB.bB",
    ".BbB..bB",
    ".BbB...bB",
    ".BbB....bB",
    ".BbB.....bB",
    ".BbBBBBBBBbB",
    ".BbbbbbbbbbbB",
    ".BNnNnNnNnNnnB",
    ".BBBBBBBBBBBBBB",
  ),
  /** 빨간펜: the red pen, cap off, nib down to the left. */
  "red-pen": (() => {
    const pic = Pic.blank(16, 16);
    stroke(pic, 13, 2, 7, 8, "R", "r", "x");
    put(pic, "SS\nSs", 7, 7);
    stroke(pic, 7, 9, 4, 12, "W", "p", "s");
    put(pic, "rr\nr.", 2, 13);
    put(pic, "X", 12, 1);
    return clean(seal(grow(pic, "RrxSsWpsX", "o"), "o"), "*o").toString();
  })(),
};

const PHYSICS_TOOLS = {
  /** 초시계: a brass-crowned stopwatch, its hand at the quarter. */
  stopwatch: sealed(
    "......YY",
    ".....yYgG",
    "......gG",
    "...WWWWWW",
    "..WWsssWWs",
    ".WWs.q.sWWs",
    ".Wsq..q.sWs",
    ".Ws..qq.sWs",
    ".Wsq.....Ws",
    ".WWs.q..sWs",
    "..WWsssWWs",
    "...WWWWWs",
    "....sssss",
  ),
  /** 프리즘: a glass prism, white light in, a spread of colour out. */
  prism: sealed(
    "",
    "......5",
    ".....545",
    "....54445",
    "....5443445",
    "WW.54444345",
    "..W544443345",
    ".....5444333449",
    "....544444333M9",
    "...54444443333YM",
    "..555555555555HY",
    "..............4H",
  ),
  /** 스프링: a steel coil, compressed at one end. */
  spring: sealed(
    "",
    "...SSSSSSSS",
    "...sddddddS",
    "....WWWWWW",
    "...sddddddS",
    "....WWWWWW",
    "...sddddddS",
    "....WWWWWW",
    "...sddddddS",
    "....WWWWWW",
    "...sddddddS",
    "...SSSSSSSS",
  ),
  /** 사과: the apple, a leaf on its stem. */
  apple: sealed(
    "",
    ".......cff",
    "......cffh",
    "......c",
    "...xxxcxxx",
    "..xRRrrrrxx",
    ".xRRrrrrrrxx",
    ".xRrrrrrrrrx",
    ".xrrrrrrrrxx",
    ".xrrrrrrrrxx",
    "..xrrrrrrxx",
    "..xxrrrrxx",
    "...xxxxxx",
  ),
};

const CHEMISTRY_TOOLS = {
  /** 원소 카드: a card off the table, sodium. */
  "element-card": sealed(
    "",
    "..WWWWWWWWWW",
    "..W33333333W",
    "..WWWWWWWWWW",
    "..WWqWWqWWWW",
    "..WWqqWqWWWW",
    "..WWqWqqWqqW",
    "..WWqWWqWqqW",
    "..WWWWWWWqqW",
    "..WWWWWWWWWW",
    "..W4444WWWWW",
    "..WWWWWWWWWW",
    "..ssssssssss",
  ),
  /** 분자 모형: balls and sticks, a carbon and its neighbours. */
  "molecule-kit": sealed(
    "",
    "..WWW",
    ".WWWW......xxx",
    ".WWWS.....xRrx",
    "..SS......xrrx",
    "....S...SS.xx",
    ".....kkkS",
    "....kkmkk",
    "....kmmkk",
    "....kkkkk",
    "...S.kkk.S",
    "..S.......S",
    ".444......444",
    "4444.....4444",
    "4433.....4433",
  ),
  /** 전자저울: a scale, its pan and its readout. */
  scale: sealed(
    "",
    "",
    "..SSSSSSSSSSSS",
    "..WWWWWWWWWWWW",
    ".......SS",
    ".......SS",
    "..nnnnnnnnnnnn",
    "..nHHHHHHHHHnn",
    "..nHFFHFFHFHnn",
    "..nHHHHHHHHHnn",
    "..nnnnnnnnnnnn",
    "..nnWWnnnnWWnn",
    "..NNNNNNNNNNNN",
  ),
  /** 지시약: an indicator bottle and the strip it turned. */
  indicator: sealed(
    "......SS",
    "......SS",
    ".....WWWW",
    ".....W44W......",
    "....WWWWWW",
    "....W5555W....",
    "....W5PP5W..jj",
    "....W5PP5W..jj",
    "....W5555W..HH",
    "....W5555W..44",
    "....WWWWWW..33",
    ".............PP",
    ".............RR",
  ),
};

const tool = sprite({
  ...ui,
  name: "tool",
  size: [16, 16],
  palette: TOOL,
  // Glints on metal and glass are single pixels by nature.
  lone: "*Wy5",
  frames: {
    ...MATH_TOOLS,
    ...PHYSICS_TOOLS,
    ...CHEMISTRY_TOOLS,
    /** 컴퍼스: a drawing compass, needle leg and pencil leg. */
    compass: compass(),
    /** 모눈자: a clear ruler printed with a grid and ticks. */
    "grid-ruler": stack(
      "................",
      "................",
      "................",
      ".oooooooooooooo.",
      ".oBNBBNBBNBBNBo.",
      ".oBNBBNBBNBBNBo.",
      ".obbbbbbbbbbbbo.",
      ".oBBbBBbBBbBBbo.",
      ".obbbbbbbbbbbbo.",
      ".oBBbBBbBBbBBbo.",
      ".onnnnnnnnnnnno.",
      ".oooooooooooooo.",
      "................",
      "................",
      "................",
      "................",
    ),
    /** 저울추: a brass weight with its lifting knob. */
    weight: stack(
      "................",
      "......oooo......",
      ".....oyYgGo.....",
      ".....oYggGo.....",
      "......oGGo......",
      "....oooooooo....",
      "...oyyYYYYgGo...",
      "...oyYYYYYgGo...",
      "..oyYYYYYYggGo..",
      "..oYYYYYYYggGo..",
      ".oyYYYYYYYYggGo.",
      ".oYYYYYYYYYggGo.",
      ".ogggggggggggGo.",
      ".oGGGGGGGGGGGGo.",
      "..oooooooooooo..",
      "................",
    ),
    /** 건전지: a cell, gold cap, plus sign. */
    battery: stack(
      "......oooo......",
      "......oSSo......",
      "....oooooooo....",
      "....oyYYYgGo....",
      "....oYYYggGo....",
      "....ouuuuuuo....",
      "....oBbbnnNo....",
      "....oBbbWnNo....",
      "....oBbWWWNo....",
      "....oBbbWnNo....",
      "....oBbbnnNo....",
      "....oBbbnnNo....",
      "....oBbbnnNo....",
      "....oSSSSSSo....",
      "....oooooooo....",
      "................",
    ),
    /** 피펫: a glass dropper with a rubber bulb, a drop at its tip. */
    pipette: stack(
      "...........ooo..",
      "..........oRRro.",
      ".........oRrrrxo",
      ".........orrrrxo",
      "........ooxxxxo.",
      ".......oWpoooo..",
      "......oWpo......",
      ".....oWpo.......",
      "....oW5o........",
      "...oW4o.........",
      "..oW4o..........",
      "..o44o..........",
      "..oo4o..........",
      "...o3o..........",
      "...o3o..........",
      "....o...........",
    ),
    /** 알코올램프: the lamp, its wick lit with a blue flame. */
    "alcohol-lamp": stack(
      ".......o........",
      "......o5o.......",
      "......o4o.......",
      ".....o454o......",
      ".....o333o......",
      "......o3o.......",
      "......ooo.......",
      ".....oSSSo......",
      "....ooSSSoo.....",
      "...oWppppppo....",
      "..oWp55555pSo...",
      "..oW4444444So...",
      "..op4444443So...",
      "..op3333333So...",
      "...oSSSSSSSo....",
      "....ooooooo.....",
    ),
    /** 현미경: tube, arm, stage and foot. */
    microscope: stack(
      "....oooo........",
      "....oSSo........",
      "...oooooo.......",
      "....oSdo..ooo...",
      "....oSdo.oSdo...",
      "....oSdo.oSdo...",
      "...onnnnooSdo...",
      "....okko.oSdo...",
      "..ooooooooSdo...",
      "..oWssssssSdo...",
      "..oooooooooSdo..",
      "..........oSdo..",
      ".....ooooooSdo..",
      "....oWsssssssdo.",
      "....oooooooooooo",
      "................",
    ),
    /** 핀셋: tweezers, closed at the tips, green grips. */
    tweezers: tweezers(),
    /** 지진계: the drum's paper with a trace on it, and the pen arm. */
    seismometer: stack(
      "............ooo.",
      "...........oCCo.",
      "..........oCco..",
      ".........okco...",
      ".oooooooookoooo.",
      ".oWWWWWWWokWWso.",
      ".oWWWWWWWWuWWso.",
      ".oWWWuWWWuWuWso.",
      ".oWuWuWuuWWuWso.",
      ".ouWWWuWWWWWuso.",
      ".oWWWWWWWWWWWso.",
      ".osssssssssssso.",
      ".oCCCCCCCCCCCCo.",
      ".occcccccccccco.",
      "..oooooooooooo..",
      "................",
    ),
    /** 돌망치: a geologist's hammer, square face and pick, on a hickory handle. */
    "rock-hammer": stack(
      "................",
      ".ooooo..........",
      ".oWsSoooooo.....",
      ".osSSSSSSSdooo..",
      ".oSSSdSSddddddo.",
      ".odddoooooooooo.",
      ".ooooEoo........",
      "....oEco........",
      "....oEco........",
      "....oEco........",
      "....oEco........",
      "....oEco........",
      "....oEco........",
      "....oEco........",
      "....occo........",
      ".....oo.........",
    ),
  },
});

export default [tool];
