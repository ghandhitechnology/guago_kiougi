import { stack } from "../../draw.ts";
import { sprite } from "../../format.ts";
import { clean, grow, Pic, put } from "../../fx.ts";
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

const tool = sprite({
  ...ui,
  name: "tool",
  size: [16, 16],
  palette: TOOL,
  // Glints on metal and glass are single pixels by nature.
  lone: "*Wy5",
  frames: {
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
