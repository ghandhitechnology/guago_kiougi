import { INTERNAL_HEIGHT as H, INTERNAL_WIDTH as W } from "@guago/shared";
import * as Phaser from "phaser";
import { BootScene } from "./boot-scene.ts";
import { FrontScene } from "./front/front-scene.ts";
import { UiScene } from "./ui/ui-scene.ts";
import { WorldScene } from "./world-scene.ts";

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: "game",
  width: W,
  height: H,
  backgroundColor: "#000000",
  banner: false,
  render: { pixelArt: true },
  scale: { mode: Phaser.Scale.NONE },
  // Back to front; the UI scene stays on top of the world.
  scene: [BootScene, FrontScene, WorldScene, UiScene],
});

/**
 * Scales the 480×270 canvas by the largest whole number of device pixels that fits, and places
 * it on whole device pixels so fractional device pixel ratios cannot smear a pixel column.
 */
function fit(): void {
  const dpr = window.devicePixelRatio || 1;
  const vw = window.innerWidth * dpr;
  const vh = window.innerHeight * dpr;
  const k = Math.max(1, Math.floor(Math.min(vw / W, vh / H) + 1e-6));
  game.scale.setZoom(k / dpr);
  game.canvas.style.left = `${Math.floor((vw - W * k) / 2) / dpr}px`;
  game.canvas.style.top = `${Math.floor((vh - H * k) / 2) / dpr}px`;
}

game.events.once(Phaser.Core.Events.READY, fit);
window.addEventListener("resize", fit);
window.visualViewport?.addEventListener("resize", fit);
