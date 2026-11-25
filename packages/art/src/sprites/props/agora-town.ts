import { finish, hline, ovalShadow, rect, vline } from "../../interior.ts";
import { greek, hash } from "../../page1.ts";
import { Pic } from "../../paint.ts";

/**
 * The 아고라's buildings, so a player always has architecture on screen: courtyard houses with
 * tiled roofs and patched plaster (a whitewashed one, an ochre one with a vine over the door, a
 * potter's with its shop open to the street, the mint in squared stone with its chimney), the
 * round tholos where the council eats, the temple on the hill, and the water clock that times
 * the speeches. Lit from the top left like everything else.
 */

// Roofs --------------------------------------------------------------------------------------

/**
 * A tiled roof seen from the street: the far slope a thin dark strip, the ridge, then the near
 * slope in rows of cover tiles running down to an eave of antefixes. `x0..x1` at the eave,
 * drawn in from both ends toward the ridge so the hips read.
 */
export function roof(p: Pic, x0: number, x1: number, top: number, eave: number, hip = 4): void {
  for (let y = top; y <= eave; y++) {
    const inset = Math.max(0, Math.round(((eave - y) / (eave - top)) * hip));
    for (let x = x0 + inset; x <= x1 - inset; x++) {
      const k = (x - x0) % 6;
      let ch = k === 0 ? "P" : k === 1 ? "t" : k === 5 ? "C" : y - top < 6 ? "t" : "T";
      if (y === top) ch = "Q";
      else if (y < top + 3) ch = y === top + 1 ? "t" : "C";
      else if ((y - top - 3) % 6 === 5 && k > 1) ch = "C";
      if (y >= eave - 1) ch = y === eave ? "Q" : k < 2 ? "w" : "C";
      if (x === x0 + inset) ch = "P";
      p.set(x, y, ch);
    }
  }
}

/** Plaster, with patches where it fell off and the mud brick shows, and a stone socle. */
export function wall(
  p: Pic,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  plaster: string,
  seed: number,
) {
  const [lit, mid, dark] =
    plaster === "white" ? ["w", "k", "K"] : plaster === "ochre" ? ["p", "t", "T"] : ["k", "K", "M"];
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      let ch = x < x0 + 2 ? lit : mid;
      if (x > x1 - 2) ch = dark;
      if (y === y0) ch = "M";
      if (plaster === "stone") {
        const course = Math.floor((y - y0) / 5);
        const joint = (y - y0) % 5 === 4 || (x + course * 7) % 14 === 0;
        if (joint) ch = "M";
      }
      p.set(x, y, ch);
    }
  if (plaster !== "stone") {
    // Fallen plaster: a patch of brick courses, two or three per wall.
    for (let k = 0; k < 3; k++) {
      const px = x0 + 4 + Math.floor(hash(k, seed) * (x1 - x0 - 14));
      const py = y0 + 4 + Math.floor(hash(seed, k) * (y1 - y0 - 12));
      const w = 6 + Math.floor(hash(k, seed, 3) * 5);
      for (let y = py; y < py + 4; y++)
        for (let x = px + ((y - py) % 2); x < px + w - ((y - py) % 2); x++)
          p.set(x, y, (y - py) % 2 === 1 && x % 4 === 0 ? "C" : "T");
    }
  }
  rect(p, x0, y1 - 3, x1 - x0 + 1, 4, "M");
  for (let x = x0; x <= x1; x += 5) vline(p, x, y1 - 3, 4, "S");
  hline(p, x0, y1 - 3, x1 - x0 + 1, "K");
}

export function door(p: Pic, x: number, y1: number, paint: string): void {
  rect(p, x - 1, y1 - 19, 12, 20, "b");
  rect(p, x, y1 - 18, 10, 18, paint);
  vline(p, x + 4, y1 - 18, 18, "J");
  hline(p, x, y1 - 18, 10, "u");
  p.set(x + 7, y1 - 9, "y");
  rect(p, x - 2, y1 - 21, 14, 2, "U");
}

export function window(p: Pic, x: number, y: number): void {
  rect(p, x - 1, y - 1, 9, 8, "b");
  rect(p, x, y, 7, 6, "J");
  vline(p, x + 3, y, 6, "U");
  hline(p, x - 1, y + 7, 9, "u");
}

// Houses ---------------------------------------------------------------------------------------

const HOUSE_W = 80;
const HOUSE_H = 74;

/**
 * A house on the street, five tiles wide. `kind` picks the household: `white` (blue door),
 * `ochre` (vine over the door, a jar by it), `potter` (the shop open, shelves of pots inside),
 * `mint` (squared stone, an iron-bound door, a chimney).
 */
function house(kind: "white" | "ochre" | "potter" | "mint"): Pic {
  const p = Pic.blank(HOUSE_W, HOUSE_H);
  const eave = 30;
  const plaster = kind === "white" ? "white" : kind === "mint" ? "stone" : "ochre";
  roof(p, 2, HOUSE_W - 3, 4, eave, 6);
  if (kind === "mint") {
    // The chimney, squared stone, blackened at the top.
    rect(p, 56, 0, 8, 16, "K");
    vline(p, 56, 0, 16, "k");
    vline(p, 63, 0, 16, "M");
    rect(p, 56, 0, 8, 3, "I");
  }
  wall(p, 4, HOUSE_W - 5, eave + 1, HOUSE_H - 2, plaster, kind.length * 7);
  const foot = HOUSE_H - 2;
  if (kind === "white") {
    door(p, 14, foot - 3, "n");
    window(p, 46, 40);
    window(p, 60, 40);
  } else if (kind === "ochre") {
    door(p, 34, foot - 3, "U");
    window(p, 12, 40);
    window(p, 62, 40);
    // The vine: a beam over the door and leaves hanging off it.
    hline(p, 26, eave + 3, 28, "b");
    for (let x = 26; x < 54; x++) {
      const h = 2 + Math.floor(hash(x, 4) * 5);
      for (let y = eave + 4; y < eave + 4 + h; y++) p.set(x, y, (x + y) % 3 ? "G" : "D");
      if (hash(x, 9) > 0.8) p.set(x, eave + 4 + h, "X");
    }
  } else if (kind === "potter") {
    // The shop front open to the street: shelves of pots in the dark inside.
    rect(p, 10, eave + 8, 46, 26, "B");
    rect(p, 12, eave + 10, 42, 22, "J");
    for (const y of [eave + 17, eave + 26]) {
      hline(p, 12, y, 42, "U");
      for (let x = 14; x < 52; x += 7) p.put(".CC.\nCttC\nCTTC", x + (y % 2), y - 3);
    }
    rect(p, 8, eave + 6, 50, 2, "U");
    window(p, 64, 40);
  } else {
    // The mint: a heavy door, an owl cut over it, a grille.
    rect(p, 30, foot - 26, 20, 23, "B");
    rect(p, 32, foot - 24, 16, 21, "b");
    for (let y = foot - 22; y < foot - 3; y += 5) hline(p, 32, y, 16, "I");
    p.put(".oo.\noyyo\noJJo\n.oo.", 38, eave + 4);
    for (const x of [12, 62]) {
      rect(p, x, 42, 6, 8, "J");
      for (let k = 0; k < 6; k += 2) vline(p, x + k, 42, 8, "I");
    }
  }
  return finish(p, "yXIJ");
}

// The tholos ----------------------------------------------------------------------------------

/** The round house where the council eats: a drum of stone, a cone of tiles, a porch in front. */
function tholos(): Pic {
  const W = 96;
  const H = 96;
  const p = Pic.blank(W, H);
  const cx = W / 2;
  const R = 42;
  // The drum: shaded round, lit on its west side.
  for (let y = 44; y < 86; y++)
    for (let x = cx - R; x <= cx + R; x++) {
      const u = (x - cx) / R;
      const base = 86 + Math.round(Math.sqrt(Math.max(0, 1 - u * u)) * 6);
      if (y > base) continue;
      const ch = u < -0.6 ? "k" : u < 0.1 ? "K" : u < 0.6 ? "V" : "M";
      p.set(x, y, (y - 44) % 6 === 5 ? (u < 0 ? "V" : "S") : ch);
    }
  // The cone: tiles running from the lantern down to the eave.
  for (let y = 6; y < 48; y++) {
    const t = (y - 6) / 42;
    const half = 6 + t * (R + 2);
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
      const a = (x - cx) / half;
      const rib = Math.round((a + 1) * 9) % 2 === 0;
      let ch = a < -0.5 ? (rib ? "P" : "t") : a < 0.3 ? (rib ? "t" : "T") : rib ? "T" : "C";
      if (y > 44) ch = (x % 4 < 2 ? "w" : "C") as string;
      p.set(x, y, ch);
    }
  }
  // The lantern on top.
  rect(p, cx - 5, 0, 10, 7, "K");
  vline(p, cx - 5, 0, 7, "w");
  rect(p, cx - 3, 2, 6, 3, "J");
  // The porch: four small columns and a beam, the door dark behind them.
  rect(p, cx - 9, 60, 18, 26, "J");
  rect(p, cx - 22, 52, 44, 4, "k");
  hline(p, cx - 22, 52, 44, "w");
  for (const dx of [-20, -9, 4, 15]) {
    for (let y = 56; y < 86; y++) p.put("dwkKMd", cx + dx, y);
  }
  rect(p, cx - 24, 86, 48, 3, "k");
  rect(p, cx - 24, 89, 48, 3, "K");
  hline(p, cx - 24, 86, 48, "w");
  return finish(p);
}

// The temple on the hill -------------------------------------------------------------------------

/**
 * The temple on the rise over the town: six columns across the front, a pediment with figures in
 * it, the long roof running back behind, on three steps.
 */
function temple(): Pic {
  const W = 128;
  const H = 108;
  const p = Pic.blank(W, H);
  // The roof's top, seen running back behind the pediment the whole width of the temple.
  roof(p, 6, W - 7, 2, 35, 0);
  // Pediment.
  for (let y = 20; y < 36; y++) {
    const half = Math.round(((y - 19) / 16) * (W / 2 - 8));
    for (let x = W / 2 - half; x < W / 2 + half; x++) p.set(x, y, y === 35 ? "w" : "K");
  }
  for (let y = 24; y < 34; y++) {
    const half = Math.round(((y - 23) / 12) * (W / 2 - 16));
    for (let x = W / 2 - half; x < W / 2 + half; x++) p.set(x, y, "V");
  }
  // Figures in the pediment, a god in the middle, others leaning out to the corners.
  for (const [x, h] of [
    [64, 9],
    [54, 7],
    [74, 7],
    [44, 5],
    [84, 5],
    [34, 3],
    [94, 3],
  ] as const)
    for (let y = 34 - h; y < 34; y++) p.set(x, y, "k").set(x + 1, y, "K");
  // Entablature.
  rect(p, 6, 36, W - 12, 3, "w");
  rect(p, 6, 39, W - 12, 5, "k");
  for (let x = 8; x < W - 8; x += 10) p.put("VkV\nVkV\nVkV\nVkV", x, 39);
  rect(p, 6, 44, W - 12, 4, "K");
  hline(p, 6, 47, W - 12, "M");
  // Six columns, the cella dark between them.
  rect(p, 10, 48, W - 20, 46, "S");
  rect(p, 10, 48, W - 20, 4, "I");
  for (let k = 0; k < 6; k++) {
    const x = 10 + k * 20;
    for (let y = 48; y < 94; y++) p.put("dwkkKkKkVMSd", x, y);
    rect(p, x - 1, 48, 14, 3, "k");
    hline(p, x - 1, 48, 14, "w");
  }
  // Three steps.
  for (let s = 0; s < 3; s++) {
    const y = 94 + s * 4;
    rect(p, 6 - s * 3, y, W - 12 + s * 6, 4, "k");
    hline(p, 6 - s * 3, y, W - 12 + s * 6, "w");
    hline(p, 6 - s * 3, y + 3, W - 12 + s * 6, "M");
  }
  return finish(p);
}

// Halls ------------------------------------------------------------------------------------------

/**
 * A hall with a columned front: a pediment over `cols` columns, the long tiled roof seen running
 * back behind it, two steps. With `notes`, every column has a sheet pinned to it (the 리케이온's
 * syllabi), and the wall behind is hung with more.
 */
export function hall(cols: number, notes: boolean): Pic {
  const gap = 18;
  const W = cols * gap + 14;
  const H = 92;
  const p = Pic.blank(W, H);
  roof(p, 3, W - 4, 2, 30, 0);
  for (let y = 18; y < 31; y++) {
    const half = Math.round(((y - 17) / 13) * (W / 2 - 6));
    for (let x = Math.round(W / 2 - half); x < W / 2 + half; x++) p.set(x, y, y === 30 ? "w" : "K");
  }
  for (let y = 22; y < 29; y++) {
    const half = Math.round(((y - 21) / 8) * (W / 2 - 14));
    for (let x = Math.round(W / 2 - half); x < W / 2 + half; x++) p.set(x, y, "V");
  }
  rect(p, 3, 31, W - 6, 3, "w");
  rect(p, 3, 34, W - 6, 4, "k");
  for (let x = 6; x < W - 6; x += 9) p.put("VkV\nVkV\nVkV\nVkV", x, 34);
  rect(p, 3, 38, W - 6, 3, "K");
  // The wall behind the columns, in the porch's shade; with notes it is papered over.
  rect(p, 6, 41, W - 12, 40, notes ? "M" : "S");
  rect(p, 6, 41, W - 12, 3, "I");
  if (notes)
    for (let k = 0; k < cols * 2; k++) {
      const x = 9 + Math.floor(hash(k, 3) * (W - 24));
      const y = 47 + Math.floor(hash(3, k) * 22);
      rect(p, x, y, 6, 7, "w");
      hline(p, x + 1, y + 2, 4, "I");
      hline(p, x + 1, y + 4, 3, "I");
    }
  else {
    rect(p, W / 2 - 8, 52, 16, 29, "J");
    rect(p, W / 2 - 10, 50, 20, 2, "U");
  }
  for (let k = 0; k < cols; k++) {
    const x = 7 + k * gap;
    for (let y = 41; y < 81; y++) p.put("dwkkKkKVMd", x, y);
    rect(p, x - 1, 41, 12, 2, "k");
    hline(p, x - 1, 41, 12, "w");
    if (notes) {
      rect(p, x + 1, 54, 8, 10, "w");
      vline(p, x + 8, 54, 10, "k");
      for (let y = 56; y < 63; y += 2) hline(p, x + 2, y, 3 + ((k + y) % 3), "I");
      p.set(x + 4, 53, "R").set(x + 5, 53, "R");
    }
  }
  for (let s2 = 0; s2 < 3; s2++) {
    const y = 81 + s2 * 3;
    rect(p, 3 - s2 * 2, y, W - 6 + s2 * 4, 3, "k");
    hline(p, 3 - s2 * 2, y, W - 6 + s2 * 4, "w");
    hline(p, 3 - s2 * 2, y + 2, W - 6 + s2 * 4, "M");
  }
  return finish(p, notes ? "IRw" : "");
}

// Small civic things -------------------------------------------------------------------------------

/** The water clock: a jar on a pillar running out through a spout into a basin, by frame. */
function clepsydra(frame: number): Pic {
  const p = Pic.blank(26, 34);
  rect(p, 9, 12, 8, 16, "K");
  vline(p, 9, 12, 16, "k");
  vline(p, 16, 12, 16, "M");
  p.put(
    `
      ..CCCCCC..
      .CtPPPPtC.
      CtPtTTTTTC
      CtTTTTTTCC
      .CTTTTTCC.
      ..CCCCCC..
    `,
    8,
    5,
  );
  p.put("TTC", 18, 9);
  for (let y = 10; y < 26; y++) if ((y + frame) % 4 !== 0) p.set(20, y, "c");
  p.put(
    `
      ..KKKKKKKK..
      .KwkkkkkkkM.
      K~cc9999ccKM
      MKKKKKKKKKMM
    `,
    14,
    27,
  );
  p.put(".MMM.\nMKKKM", 7, 28);
  return finish(p, "c~");
}

export default [
  greek(
    "townhouse",
    { white: house("white"), ochre: house("ochre"), potter: house("potter"), mint: house("mint") },
    {
      origin: [40, HOUSE_H - 1],
      lone: "yX",
      shadow: ovalShadow(HOUSE_W, HOUSE_H, 41, HOUSE_H - 2, 38, 2),
    },
  ),
  greek("bouleuterion", { still: hall(5, false) }, { shadow: ovalShadow(104, 92, 52, 90, 50, 3) }),
  greek("tholos", { still: tholos() }, { shadow: ovalShadow(96, 96, 49, 91, 44, 4) }),
  greek("temple", { still: temple() }, { shadow: ovalShadow(128, 108, 64, 106, 62, 3) }),
  greek(
    "clepsydra",
    { run0: clepsydra(0), run1: clepsydra(1), run2: clepsydra(2), run3: clepsydra(3) },
    {
      anim: { run: { frames: ["run0", "run1", "run2", "run3"], fps: 6 } },
      lone: "c~",
      shadow: ovalShadow(26, 34, 15, 32, 10, 1.6),
    },
  ),
];
