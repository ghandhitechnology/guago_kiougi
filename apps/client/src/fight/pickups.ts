import { PICKUP_TICKS, PickupKind, TICK_MS, type WireDrop } from "@guago/shared";
import { COMBAT } from "./catalog.ts";
import type { FightContext } from "./context.ts";
import { Layer, type Piece, type Pieces, show } from "./pieces.ts";

/** The arc out of a dying monster, ms. */
const ARC_MS = 360;
/** Within this the drop leans toward the player; the server takes it at 20 px. */
const MAGNET_PX = 44;
/** The last flight into the player once the server says it was taken, ms. */
const ZIP_MS = 130;

interface Drop {
  id: number;
  kind: number;
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  bornAt: number;
  /** Drawn position, with the magnet's pull. */
  dx: number;
  dy: number;
  /** Set when the server says the player took it: the zip in. */
  takenAt: number;
  zx: number;
  zy: number;
  body: Piece;
  glint: Piece | null;
}

/** Sprite and sound of a drop by kind. */
function lookOf(kind: number, cls: string): { sprite: string; anim: string; sound: string } {
  switch (kind) {
    case PickupKind.Coin:
      return { sprite: "pickup-cone", anim: "pickup-cone/spin", sound: "sfx.pickup.cone" };
    case PickupKind.Page:
      return {
        sprite: `drop-page-${cls}`,
        anim: `drop-page-${cls}/idle`,
        sound: "sfx.pickup.page",
      };
    case PickupKind.Tool:
      return { sprite: "drop-elite", anim: "drop-elite/idle", sound: "sfx.pickup.tool" };
    default:
      return { sprite: "pickup-page", anim: "pickup-page/flutter", sound: "sfx.pickup.material" };
  }
}

/**
 * The local player's drops (PLAN §6 death: the drop arcs out). Each flies from the monster in a
 * short arc and bounces, glints if it is rare, leans toward the player within reach, and when the
 * server says it was taken, zips in with a pickup sound that climbs in pitch over a run.
 */
export class Pickups {
  private readonly ctx: FightContext;
  private readonly pieces: Pieces;
  private readonly live = new Map<number, Drop>();
  private readonly pool: Drop[] = [];

  constructor(ctx: FightContext, pieces: Pieces) {
    this.ctx = ctx;
    this.pieces = pieces;
  }

  get count(): number {
    return this.live.size;
  }

  drop(d: WireDrop): void {
    if (this.live.has(d.id)) return;
    const cat = this.ctx.cat;
    const look = lookOf(d.kind, this.ctx.selfClass);
    const sprite = cat.has(look.sprite) ? look.sprite : "pickup-page";
    const body = this.pieces.take(Layer.Ground);
    show(
      body,
      cat.atlas(sprite),
      cat.frame(sprite),
      `${sprite}/${Object.keys(cat.meta.sprites[sprite]?.anims ?? {})[0] ?? ""}`,
    );
    body.s.anims.setProgress(Math.random());
    let glint: Piece | null = null;
    if (d.kind === PickupKind.Tool || d.kind === PickupKind.Binding) {
      glint = this.pieces.take(Layer.Glow, true);
      const g = d.kind === PickupKind.Tool ? "drop-glint-purple" : "drop-glint-blue";
      show(glint, COMBAT, cat.frame(g), `${g}/shine`);
    }
    const p = this.pool.pop() ?? ({} as Drop);
    p.id = d.id;
    p.kind = d.kind;
    p.x = d.x;
    p.y = d.y;
    p.fromX = d.fromX;
    p.fromY = d.fromY;
    p.bornAt = this.ctx.now;
    p.dx = d.fromX;
    p.dy = d.fromY;
    p.takenAt = 0;
    p.body = body;
    p.glint = glint;
    this.live.set(d.id, p);
    // Rare drops ring out as they land; the rest tick.
    const sound = d.kind === PickupKind.Coin ? "combat.drop.cone" : "combat.drop.page";
    this.ctx.scene.time.delayedCall(ARC_MS * 0.8, () => {
      if (this.live.get(d.id) === p) this.ctx.sound.cue(sound, p.x, p.y, true);
    });
    if (d.kind === PickupKind.Tool) this.ctx.sound.self("jingle.rare-drop");
  }

  /** The server gave the player drop `id`. */
  collect(id: number): void {
    const p = this.live.get(id);
    if (!p || p.takenAt > 0) return;
    p.takenAt = this.ctx.now;
    p.zx = p.dx;
    p.zy = p.dy;
    this.ctx.sound.self(lookOf(p.kind, this.ctx.selfClass).sound);
  }

  update(): void {
    const now = this.ctx.now;
    const sx = this.ctx.selfX;
    const sy = this.ctx.selfY;
    for (const p of this.live.values()) {
      const s = p.body.s;
      if (p.takenAt > 0) {
        const f = Math.min(1, (now - p.takenAt) / ZIP_MS);
        const e = f * f;
        p.dx = p.zx + (sx - p.zx) * e;
        p.dy = p.zy + (sy - 10 - p.zy) * e;
        s.setPosition(Math.round(p.dx), Math.round(p.dy)).setScale(1 - f * 0.5);
        p.glint?.s.setVisible(false);
        if (f >= 1) {
          this.twinkle(sx, sy - 12);
          this.remove(p);
        }
        continue;
      }
      const age = now - p.bornAt;
      if (age > PICKUP_TICKS * TICK_MS) {
        this.remove(p);
        continue;
      }
      let x = p.x;
      let y = p.y;
      let z = 0;
      let squash = 0;
      if (age < ARC_MS) {
        const f = age / ARC_MS;
        x = p.fromX + (p.x - p.fromX) * f;
        y = p.fromY + (p.y - p.fromY) * f;
        z = 18 * 4 * f * (1 - f);
      } else if (age < ARC_MS + 160) {
        // One small bounce on landing.
        const f = (age - ARC_MS) / 160;
        z = 3 * 4 * f * (1 - f);
        squash = f < 0.2 ? 0.3 : 0;
      } else {
        // Within reach it leans toward the player.
        const dx = sx - p.x;
        const dy = sy - p.y;
        const d = Math.hypot(dx, dy);
        if (d < MAGNET_PX && d > 1) {
          const pull = (1 - d / MAGNET_PX) * 10;
          x += (dx / d) * pull;
          y += (dy / d) * pull;
        }
        z = 1 + Math.sin(now * 0.006 + p.id) * 1;
      }
      p.dx = x;
      p.dy = y;
      s.setScale(1 + squash, 1 - squash);
      // Ground pieces sort by their top edge: the drop stands on its feet at y.
      s.setOrigin(0.5, 1).setPosition(Math.round(x), Math.round(y - z));
      if (p.glint) p.glint.s.setPosition(Math.round(x), Math.round(y - z)).setOrigin(0.5, 0.95);
    }
  }

  private twinkle(x: number, y: number): void {
    const cat = this.ctx.cat;
    const t = this.pieces.take(Layer.Glow, true);
    const s = show(t, COMBAT, cat.frame("fx-pickup"), "fx-pickup/twinkle");
    s.setPosition(Math.round(x), Math.round(y));
    s.once("animationcomplete", () => this.pieces.give(t));
  }

  private remove(p: Drop): void {
    this.pieces.give(p.body);
    if (p.glint) this.pieces.give(p.glint);
    this.live.delete(p.id);
    this.pool.push(p);
  }

  clear(): void {
    for (const p of [...this.live.values()]) this.remove(p);
  }
}
