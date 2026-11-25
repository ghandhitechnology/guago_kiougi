/**
 * The game's view in game pixels. Lying down it is 270 tall at the largest whole-number scale
 * that fits, and as wide as the device shows at that scale, from 480 up to `MAX_W`, so a long
 * phone fills its sides with world instead of black. Standing up it fills the whole upright
 * screen, which only the rotate card uses. `safe` is how far the notch and the rounded corners
 * reach into each edge; HUD pieces anchor inside it.
 */
export interface Screen {
  w: number;
  h: number;
  /** Device pixels per game pixel. */
  k: number;
  upright: boolean;
  safe: { left: number; right: number; top: number; bottom: number };
}

export const MIN_W = 480;
export const BASE_H = 270;
/** Wider than a 21:9 monitor needs; past this the sides stay black. */
export const MAX_W = 720;

export const screen: Screen = {
  w: MIN_W,
  h: BASE_H,
  k: 1,
  upright: false,
  safe: { left: 0, right: 0, top: 0, bottom: 0 },
};

const listeners = new Set<(s: Screen) => void>();

/** Calls `fn` whenever the view changes size or shape; returns the unsubscribe. */
export function onScreen(fn: (s: Screen) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The view for a viewport of `vw` × `vh` device pixels. */
export function measureScreen(vw: number, vh: number): { w: number; h: number; k: number } {
  if (vh > vw) {
    // Upright: the rotate card covers everything at a whole-number scale.
    const k = Math.max(1, Math.floor(vw / BASE_H + 1e-6));
    return { w: Math.floor(vw / k), h: Math.floor(vh / k), k };
  }
  const k = Math.max(1, Math.floor(Math.min(vw / MIN_W, vh / BASE_H) + 1e-6));
  const w = Math.max(MIN_W, Math.min(MAX_W, Math.floor(vw / k)));
  return { w, h: BASE_H, k };
}

/** The notch's reach, from `env(safe-area-inset-*)`, in CSS pixels. */
function cssInsets(): { left: number; right: number; top: number; bottom: number } {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;visibility:hidden;pointer-events:none;" +
    "padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
  document.body.append(probe);
  const s = getComputedStyle(probe);
  const out = {
    left: Number.parseFloat(s.paddingLeft) || 0,
    right: Number.parseFloat(s.paddingRight) || 0,
    top: Number.parseFloat(s.paddingTop) || 0,
    bottom: Number.parseFloat(s.paddingBottom) || 0,
  };
  probe.remove();
  return out;
}

/**
 * Records the view and where the canvas sits (device pixels from the viewport's top left), works
 * out the safe area in game pixels, and tells everyone who listens.
 */
export function setScreen(
  view: { w: number; h: number; k: number },
  canvasLeft: number,
  canvasTop: number,
  vw: number,
  vh: number,
  dpr: number,
): void {
  const css = cssInsets();
  const inset = (cssPx: number, gap: number) =>
    Math.max(0, Math.ceil((cssPx * dpr - gap) / view.k));
  const right = vw - canvasLeft - view.w * view.k;
  const bottom = vh - canvasTop - view.h * view.k;
  const safe = {
    left: inset(css.left, canvasLeft),
    right: inset(css.right, right),
    top: inset(css.top, canvasTop),
    bottom: inset(css.bottom, bottom),
  };
  const changed =
    screen.w !== view.w ||
    screen.h !== view.h ||
    screen.k !== view.k ||
    screen.safe.left !== safe.left ||
    screen.safe.right !== safe.right ||
    screen.safe.top !== safe.top ||
    screen.safe.bottom !== safe.bottom;
  screen.w = view.w;
  screen.h = view.h;
  screen.k = view.k;
  screen.upright = view.h > view.w;
  screen.safe = safe;
  if (changed) for (const l of listeners) l(screen);
}

/** The left and right edges HUD pieces keep to: the safe area plus a margin. */
export function edges(margin = 6): { left: number; right: number; top: number; bottom: number } {
  return {
    left: screen.safe.left + margin,
    right: screen.w - screen.safe.right - margin,
    top: screen.safe.top + margin,
    bottom: screen.h - screen.safe.bottom - margin,
  };
}
