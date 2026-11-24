/**
 * The legend every UI piece shares, so one letter means one material across the kit:
 * night ink for the HUD, navy for notebook covers, cream stone for paper, red for the red pen,
 * gold for highlighter and sticky notes.
 */
export const UI = {
  ".": null,
  // Ink: outlines and the dark HUD card.
  o: "ink.deep",
  k: "ink.dark",
  m: "ink.mid",
  l: "ink.light",
  // Paper.
  D: "stone.deep",
  d: "stone.dark",
  S: "stone.mid",
  s: "stone.light",
  p: "stone.pale",
  W: "stone.bright",
  // Notebook cover.
  N: "navy.dark",
  n: "navy.mid",
  b: "navy.light",
  B: "navy.pale",
  // Red pen.
  X: "red.deep",
  x: "red.dark",
  r: "red.mid",
  R: "red.light",
  e: "red.pale",
  // The pink margin line of a notebook page.
  P: "rose.light",
  // Highlighter and sticky notes.
  u: "gold.deep",
  G: "gold.dark",
  g: "gold.mid",
  Y: "gold.light",
  y: "gold.pale",
} as const;
