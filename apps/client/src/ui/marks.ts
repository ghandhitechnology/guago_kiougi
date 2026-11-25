import type * as Phaser from "phaser";
import { MARKER, PEN, paint } from "./theme.ts";

/**
 * Pen marks drawn pixel by pixel on the page. Both animate their own drawing: the highlighter
 * swipes left to right, the red pen draws its loop clockwise from the top left.
 */
abstract class Mark {
  readonly gfx: Phaser.GameObjects.Graphics;
  protected w = 0;
  protected h = 0;
  private shown = 0;
  private tween: Phaser.Tweens.Tween | undefined;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics();
  }

  /** Sets the box the mark covers, in the parent's coordinates. */
  box(x: number, y: number, w: number, h: number): this {
    this.gfx.setPosition(Math.round(x), Math.round(y));
    this.w = Math.round(w);
    this.h = Math.round(h);
    this.paint(this.shown);
    return this;
  }

  /** Draws the mark in over `ms`, from wherever it is now. */
  show(ms: number): this {
    return this.to(1, ms);
  }

  hide(ms: number): this {
    return this.to(0, ms);
  }

  private to(target: number, ms: number): this {
    this.tween?.stop();
    if (ms <= 0) {
      this.paint(target);
      return this;
    }
    const state = { p: this.shown };
    this.tween = this.gfx.scene.tweens.add({
      targets: state,
      p: target,
      duration: ms * Math.abs(target - this.shown),
      ease: target > this.shown ? "Quad.Out" : "Quad.In",
      onUpdate: () => this.paint(state.p),
      onComplete: () => this.paint(target),
    });
    return this;
  }

  private paint(p: number): void {
    this.shown = p;
    this.gfx.clear();
    if (p <= 0 || this.w <= 0 || this.h <= 0) return;
    this.draw(p);
  }

  protected abstract draw(p: number): void;
}

/** A highlighter pass behind text, chisel-cut at both ends like the kit's row. */
export class Highlighter extends Mark {
  private readonly color: string;

  constructor(scene: Phaser.Scene, color = MARKER) {
    super(scene);
    this.color = color;
  }

  protected draw(p: number): void {
    const reach = Math.round(this.w * p);
    this.gfx.fillStyle(paint(this.color));
    for (let y = 0; y < this.h; y++) {
      // The chisel: the first rows start late, the last rows end early.
      const start = y === 0 ? 2 : y === 1 ? 1 : 0;
      const end = y === this.h - 1 ? this.w - 2 : y === this.h - 2 ? this.w - 1 : this.w;
      const to = Math.min(end, reach);
      if (to > start) this.gfx.fillRect(start, y, to - start, 1);
    }
  }
}

/** A red-pen loop round a choice, corners cut, drawn clockwise as a hand would. */
export class RedPen extends Mark {
  private readonly color: string;

  constructor(scene: Phaser.Scene, color = PEN) {
    super(scene);
    this.color = color;
  }

  protected draw(p: number): void {
    const { w, h } = this;
    const path: [number, number][] = [];
    for (let x = 1; x < w - 1; x++) path.push([x, 0]);
    for (let y = 1; y < h - 1; y++) path.push([w - 1, y]);
    for (let x = w - 2; x >= 1; x--) path.push([x, h - 1]);
    for (let y = h - 2; y >= 1; y--) path.push([0, y]);
    const n = Math.round(path.length * p);
    this.gfx.fillStyle(paint(this.color));
    for (let i = 0; i < n; i++) {
      const pt = path[i] as [number, number];
      this.gfx.fillRect(pt[0], pt[1], 1, 1);
    }
  }
}
