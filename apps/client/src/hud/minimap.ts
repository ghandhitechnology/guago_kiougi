import type * as Phaser from "phaser";
import { Label } from "../ui/text.ts";
import { paint, sliceOf } from "../ui/theme.ts";
import { type MapView, worldView } from "../world/view.ts";

/** The map's frame and the window inside it, as in the kit's composed HUD. */
export const MINIMAP = { x: 416, y: 6, size: 58, inset: 4 } as const;
const INNER = MINIMAP.size - MINIMAP.inset * 2;
const TILE = 16;
/** Minimap pixels per tile: at two, a street reads as a street and a door as a door. */
const SCALE = 2;

/** Ground by what it is made of, walls dark, water and the void darker. */
const GROUND = {
  grass: "grass.dark",
  dirt: "clay.mid",
  stone: "stone.dark",
  sand: "clay.light",
  floor: "wood.mid",
} as const;

function mapTexture(scene: Phaser.Scene, map: MapView): string {
  const key = `minimap:${map.id}`;
  if (scene.textures.exists(key)) return key;
  const { w, h, rows } = map.collision;
  const canvas = document.createElement("canvas");
  canvas.width = w * SCALE;
  canvas.height = h * SCALE;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  const css = (name: string) => `#${paint(name).toString(16).padStart(6, "0")}`;
  const colors = new Map<string, string>();
  const fill = (name: string) => {
    let c = colors.get(name);
    if (!c) {
      c = css(name);
      colors.set(name, c);
    }
    return c;
  };
  for (let y = 0; y < h; y++) {
    const row = rows[y] ?? "";
    for (let x = 0; x < w; x++) {
      const t = row[x];
      ctx.fillStyle =
        t === "#"
          ? fill("ink.mid")
          : t === "~"
            ? fill("ink.dark")
            : fill(GROUND[map.surfaceAt(x, y)]);
      ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
    }
  }
  scene.textures.addCanvas(key, canvas);
  return key;
}

/**
 * The minimap: the walked map at two pixels a tile, kept centred on the player, with doorways, other
 * students and the cast as pins, and the place's name on a card underneath.
 */
export class Minimap {
  readonly root: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly ground: Phaser.GameObjects.Image;
  private readonly me: Phaser.GameObjects.Image;
  private readonly pins: Phaser.GameObjects.Image[] = [];
  private readonly doors: Phaser.GameObjects.Image[] = [];
  private readonly nameCard: Phaser.GameObjects.NineSlice;
  private readonly nameText: Label;
  private map: MapView | undefined;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const { x, y, size, inset } = MINIMAP;
    this.root = scene.add.container(x, y);
    const back = scene.add.rectangle(inset, inset, INNER, INNER, paint("ink.deep")).setOrigin(0);
    this.ground = scene.add.image(0, 0, "__WHITE").setOrigin(0).setVisible(false);
    this.me = scene.add.image(0, 0, "ui", "map-dot/me").setOrigin(0.5);
    const [l, r, t, b] = sliceOf("minimap");
    const frame = scene.add
      .nineslice(0, 0, "ui", "minimap/idle", size, size, l, r, t, b)
      .setOrigin(0);
    const [pl, pr, pt, pb] = sliceOf("hud-plate");
    this.nameCard = scene.add
      .nineslice(0, size - 1, "ui", "hud-plate/idle", size, 15, pl, pr, pt, pb)
      .setOrigin(0);
    this.nameText = new Label(scene, 0, size + 2, "", { font: "galmuri9", color: "stone.bright" });
    this.root.add([back, this.ground, this.me, frame, this.nameCard, this.nameText.obj]);
  }

  /** Shows a map, or nothing. */
  setMap(map: MapView | undefined): void {
    this.map = map;
    for (const d of this.doors) d.destroy();
    this.doors.length = 0;
    if (!map) return;
    this.ground.setTexture(mapTexture(this.scene, map)).setVisible(true);
    for (const _ of map.portals) {
      const d = this.scene.add.image(0, 0, "ui", "map-dot/portal").setOrigin(0.5);
      this.root.addAt(d, this.root.getIndex(this.me));
      this.doors.push(d);
    }
  }

  setName(name: string): void {
    const fitted = name;
    this.nameText.set(fitted);
    this.nameText.at(Math.floor((MINIMAP.size - this.nameText.width) / 2), MINIMAP.size + 2);
  }

  /** Follows the player; call every frame. */
  update(): void {
    const map = this.map;
    if (!map) return;
    const w = map.collision.w * SCALE;
    const h = map.collision.h * SCALE;
    const { inset } = MINIMAP;
    const self = worldView.self;
    const k = SCALE / TILE;
    const cx = self ? self.x * k : w / 2;
    const cy = self ? self.y * k : h / 2;
    // The window's top-left in minimap pixels: centred on the player, held inside the map; a map smaller
    // than the window sits in its middle.
    const left =
      w <= INNER ? -Math.floor((INNER - w) / 2) : clamp(Math.round(cx - INNER / 2), 0, w - INNER);
    const top =
      h <= INNER ? -Math.floor((INNER - h) / 2) : clamp(Math.round(cy - INNER / 2), 0, h - INNER);
    const cropX = Math.max(0, left);
    const cropY = Math.max(0, top);
    this.ground
      .setCrop(cropX, cropY, Math.min(INNER, w - cropX), Math.min(INNER, h - cropY))
      .setPosition(inset - left, inset - top);
    const place = (img: Phaser.GameObjects.Image, tx: number, ty: number) => {
      const px = Math.round(inset + tx - left);
      const py = Math.round(inset + ty - top);
      const inside =
        px >= inset + 1 && py >= inset + 1 && px < inset + INNER - 1 && py < inset + INNER - 1;
      img.setPosition(px, py).setVisible(inside);
    };
    place(this.me, cx, cy);
    this.me.setVisible(self !== undefined && this.me.visible);
    map.portals.forEach((p, i) => {
      const d = this.doors[i];
      if (d) place(d, (p.x + p.w / 2) * SCALE, (p.y + p.h / 2) * SCALE);
    });
    let n = 0;
    for (const e of worldView.others.values()) {
      let pin = this.pins[n];
      if (!pin) {
        pin = this.scene.add.image(0, 0, "ui", "pin/player").setOrigin(0.5);
        this.root.addAt(pin, this.root.getIndex(this.me));
        this.pins.push(pin);
      }
      pin.setFrame(e.kind === "npc" ? "pin/npc" : "pin/player");
      place(pin, e.x * k, e.y * k);
      n++;
    }
    for (let i = n; i < this.pins.length; i++) this.pins[i]?.setVisible(false);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
