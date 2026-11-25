import * as Phaser from "phaser";
import { artMeta, createSpriteAnims, loadArt } from "./art.ts";
import { backend } from "./backend/index.ts";
import { FRONT_SCENE, UI_SCENE } from "./entry.ts";
import { startAudio } from "./sound/audio.ts";
import { setUiArt } from "./ui/theme.ts";

/** Atlases the front end draws from; the world loads its tiles itself. */
const FRONT_ATLASES = [
  "core",
  "ui",
  "portraits",
  "tiles-campus-night",
  "tiles-campus-lamp",
  "tiles-campus-dusk",
  "tiles-campus-glow",
];

/**
 * Loads what the first screens need, then asks the server whether this browser already has a
 * session: a returning player with a character goes straight to the world.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload(): void {
    // A pencil line drawn across the dark while the notebook loads.
    const bar = this.add.rectangle(140, 135, 0, 1, 0xe0d5c2).setOrigin(0);
    this.load.on(Phaser.Loader.Events.PROGRESS, (p: number) => {
      bar.width = Math.round(200 * p);
    });
    loadArt(this, { atlases: FRONT_ATLASES, fonts: true });
  }

  async create(): Promise<void> {
    const meta = artMeta(this);
    setUiArt(meta);
    startAudio();
    createSpriteAnims(this, meta);
    this.scene.launch(UI_SCENE);

    let session = null;
    try {
      session = await (await backend()).me();
    } catch {
      // The server is unreachable: the title screen says so when the player tries to sign in.
    }
    // Everyone passes the title: a returning player's 이어하기 press is the gesture that lets
    // sound start, so the world is never entered in silence.
    this.scene.start(FRONT_SCENE, { session });
  }
}
