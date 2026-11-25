import * as Phaser from "phaser";
import { backend } from "../backend/index.ts";
import { ChatPanel } from "../chat/panel.ts";
import { Joystick, touchScreen } from "../controls/joystick.ts";
import { RotateCard } from "../controls/rotate.ts";
import { FRONT_SCENE, UI_SCENE, WORLD_SCENE } from "../entry.ts";
import { Hud } from "../hud/hud.ts";
import { hud } from "../hud/store.ts";
import { Notebook } from "../menu/notebook.ts";
import { onSignOut, registerSettings } from "../menu/settings.ts";
import { session } from "../world/session.ts";
import { PlaceBanner } from "./banner.ts";
import { DialogueBox } from "./dialogue.ts";
import { setIdleKeys } from "./focus.ts";
import { setToaster, Toaster } from "./overlay.ts";
import { setWorldUiHost } from "./world-ui.ts";

/**
 * The UI layer: a scene kept above every other, at the same 480×270, so what it draws covers the
 * world and its input is tested first. It holds the toasts, the dialogue box and banner, and while
 * a player is in the world the HUD, chat, the thumb's stick and the notebook.
 */
export class UiScene extends Phaser.Scene {
  private world:
    | {
        hud: Hud;
        chat: ChatPanel | undefined;
        joystick: Joystick | undefined;
        notebook: Notebook;
        stop: () => void;
      }
    | undefined;
  private dialogue!: DialogueBox;
  private banner!: PlaceBanner;

  constructor() {
    super(UI_SCENE);
  }

  create(): void {
    setToaster(new Toaster(this));
    this.scene.bringToTop();
    registerSettings();
    onSignOut(() => void this.signOut());
    this.dialogue = new DialogueBox(this);
    this.banner = new PlaceBanner(this);
    setWorldUiHost({
      say: (lines) => this.dialogue.say(lines),
      placeBanner: (name) => this.banner.show(name),
    });
    if (touchScreen()) new RotateCard(this);
    const unwatch = session.watch((s) => (s.entry ? this.enterWorld() : this.leaveWorld()));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unwatch();
      this.leaveWorld();
      setToaster(undefined);
      setWorldUiHost(undefined);
    });
  }

  private enterWorld(): void {
    if (this.world) this.leaveWorld();
    const link = session.link;
    const touch = touchScreen();
    const chat = link ? new ChatPanel(this, link, { top: touch, rows: touch ? 5 : 7 }) : undefined;
    chat?.setFoldedButton(!touch);
    const notebook = new Notebook(this, () => hudView.setVisible(true));
    const hudView = new Hud(
      this,
      {
        openMenu: () => {
          hudView.setVisible(false);
          notebook.open();
        },
        openChat: () => chat?.open(),
      },
      touch,
    );
    const joystick = touch ? new Joystick(this) : undefined;
    setIdleKeys((e) => {
      if (e.key === "Enter" && chat) {
        chat.open();
        return true;
      }
      if (e.key === "Escape") {
        hudView.setVisible(false);
        notebook.open();
        return true;
      }
      return false;
    });
    this.dialogue.playerName = session.entry?.character.name ?? "";
    // The place's name drops in on arriving.
    let lastPlace = "";
    const unplace = hud.watch((data, changed) => {
      if (!changed.has("place") || !data.place) return;
      const name = data.place.room ?? data.place.name;
      if (name !== lastPlace) this.banner.show(name);
      lastPlace = name;
    });
    this.world = {
      hud: hudView,
      chat,
      joystick,
      notebook,
      stop: unplace,
    };
    if (import.meta.env.DEV && new URLSearchParams(location.search).has("hudfeed")) {
      void import("../hud/dev-feed.ts").then((m) => m.startDevFeed(this));
    }
  }

  private leaveWorld(): void {
    const w = this.world;
    if (!w) return;
    this.world = undefined;
    setIdleKeys(undefined);
    w.stop();
    w.notebook.close();
    w.chat?.destroy();
    w.joystick?.destroy();
    w.hud.destroy();
  }

  /** Back to the title: the server forgets the session, the world stops. */
  private async signOut(): Promise<void> {
    try {
      await (await backend()).logout();
    } catch {
      // Unreachable or already gone: the title is where a signed-out player belongs anyway.
    }
    session.stop();
    this.scene.stop(WORLD_SCENE);
    // Launch, not start: starting from here would stop this scene, and the UI layer stays.
    this.scene.launch(FRONT_SCENE, { session: null });
    this.scene.bringToTop();
  }
}
