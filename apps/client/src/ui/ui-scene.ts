import * as Phaser from "phaser";
import { UI_SCENE } from "../entry.ts";
import { setToaster, Toaster } from "./overlay.ts";

/**
 * The UI layer: a scene kept above every other, at the same 480×270, so what it draws covers the
 * world and its input is tested first. It holds the toasts now; the HUD and menus join it.
 */
export class UiScene extends Phaser.Scene {
  constructor() {
    super(UI_SCENE);
  }

  create(): void {
    setToaster(new Toaster(this));
    this.scene.bringToTop();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => setToaster(undefined));
  }
}
