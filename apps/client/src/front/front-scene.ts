import type { ArtMetadata } from "@guago/art";
import * as Phaser from "phaser";
import { artMeta } from "../art.ts";
import { type Backend, backend, type Session } from "../backend/index.ts";
import { FRONT_SCENE, WORLD_SCENE, type WorldEntry } from "../entry.ts";
import { t } from "../i18n/index.ts";
import { titleMusic } from "../sound/audio.ts";
import { fade, slide, stamp } from "../ui/motion.ts";
import { toast } from "../ui/overlay.ts";
import { onScreen, screen } from "../ui/screen.ts";
import { NightBackdrop } from "./backdrop.ts";
import { CreatorScreen } from "./creator.ts";
import {
  CodeScreen,
  type Flow,
  LoginScreen,
  RecoverScreen,
  SignupScreen,
  TitleScreen,
} from "./forms.ts";
import type { Screen } from "./screen.ts";

const W = 480;

/**
 * Everything before the world: the title over the island at night, the account forms, the
 * recovery code and the character creator. The backdrop stays put while screens change on it.
 */
export class FrontScene extends Phaser.Scene implements Flow {
  api!: Backend;
  private meta!: ArtMetadata;
  private backdrop!: NightBackdrop;
  private logo!: Phaser.GameObjects.Image;
  private logoRest = { x: 0, y: 0 };
  private current: Screen | undefined;
  private screens = new Map<string, Screen>();
  private session: Session | null = null;

  constructor() {
    super(FRONT_SCENE);
  }

  init(data: { session?: Session | null }): void {
    this.session = data.session ?? null;
    this.screens = new Map();
    this.current = undefined;
  }

  async create(): Promise<void> {
    this.meta = artMeta(this);
    titleMusic();
    // Development checks wait on the title from the console; never in a production build.
    if (import.meta.env.DEV) (window as unknown as { __guagoFront?: unknown }).__guagoFront = this;
    this.backdrop = new NightBackdrop(this, this.meta);
    // Composed on 480 × 270; on a wider screen the camera keeps it in the middle.
    const centre = () =>
      this.cameras.main.setScroll(
        -Math.floor((screen.w - W) / 2),
        -Math.floor((screen.h - 270) / 2),
      );
    centre();
    const unscreen = onScreen(centre);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unscreen);
    this.logo = this.add.image(0, 0, "ui", "logo/idle").setOrigin(0);
    this.logoRest = { x: Math.round((W - this.logo.width) / 2) + 24, y: 40 };
    this.logo.setPosition(this.logoRest.x, this.logoRest.y).setVisible(false);
    this.api = await backend();

    if (this.session && !this.session.character) {
      // Signed in before but never finished the creator.
      this.backdrop.look(0, 0);
      this.creator();
      return;
    }
    // The opening: the view starts high in the sky and tilts down to the school, then the
    // title lands and the doors open.
    this.backdrop.look(150, 0);
    this.backdrop.look(0, 2200, "Sine.InOut");
    this.time.delayedCall(1500, () => {
      stamp(this.logo, this.logoRest);
    });
    this.time.delayedCall(2000, () => this.go("title"));
  }

  override update(time: number, delta: number): void {
    this.backdrop?.update(time, delta);
  }

  title(): void {
    this.showLogo("title");
    this.go("title");
  }

  login(loginId?: string): void {
    const s = this.screen("login", () => new LoginScreen(this, this)) as LoginScreen;
    s.prefill(loginId);
    this.showLogo("form");
    this.go("login");
  }

  signup(): void {
    this.showLogo("form");
    this.go("signup");
  }

  recover(): void {
    this.showLogo("form");
    this.go("recover");
  }

  signedUp(session: Session, code: string): void {
    this.session = session;
    const s = this.screen("code", () => new CodeScreen(this)) as CodeScreen;
    s.show(code, () => this.creator());
    this.showLogo("form");
    this.go("code");
  }

  recovered(loginId: string, code: string): void {
    const s = this.screen("code", () => new CodeScreen(this)) as CodeScreen;
    s.show(code, () => {
      toast(t("recover.done"));
      this.login(loginId);
    });
    this.showLogo("form");
    this.go("code");
  }

  get returning(): boolean {
    return this.session?.character !== null && this.session?.character !== undefined;
  }

  resume(): void {
    const s = this.session;
    if (s?.character) this.enterWorld({ account: s.account, character: s.character });
  }

  signedIn(session: Session): void {
    this.session = session;
    if (session.character)
      this.enterWorld({ account: session.account, character: session.character });
    else this.creator();
  }

  private creator(): void {
    this.showLogo("hidden");
    this.go("creator");
  }

  /** Hands over to the world: the screen fades to the night's ink, then the world starts. */
  enterWorld(entry: WorldEntry): void {
    this.current?.close();
    this.current = undefined;
    this.backdrop.shade(1, 400);
    this.time.delayedCall(420, () => this.scene.start(WORLD_SCENE, entry));
  }

  /** Signed out: back to the title. */
  async signOut(): Promise<void> {
    try {
      await this.api.logout();
    } catch {
      // Already gone or unreachable: the title is where a signed-out player belongs anyway.
    }
    this.session = null;
    this.title();
    // The next student starts from a clean sheet.
    const creator = this.screens.get("creator");
    if (creator instanceof CreatorScreen) {
      this.screens.delete("creator");
      this.time.delayedCall(400, () => creator.dispose());
    }
  }

  get account() {
    return this.session?.account;
  }

  /** The title rests over the sea on the title screen and moves up out of a form's way. */
  private showLogo(where: "title" | "form" | "hidden"): void {
    if (where === "hidden") {
      fade(this.logo, 0, 120);
      return;
    }
    const to = { x: this.logoRest.x, y: where === "title" ? this.logoRest.y : 12 };
    if (!this.logo.visible || this.logo.alpha === 0) {
      this.logo.setPosition(to.x, to.y);
      fade(this.logo, 1, 160);
    } else slide(this.logo, to, 180);
  }

  private screen(name: string, make: () => Screen): Screen {
    let s = this.screens.get(name);
    if (!s) {
      s = make();
      this.screens.set(name, s);
    }
    return s;
  }

  private go(name: string): void {
    const next = this.screen(name, () => {
      switch (name) {
        case "title":
          return new TitleScreen(this, this);
        case "login":
          return new LoginScreen(this, this);
        case "signup":
          return new SignupScreen(this, this);
        case "recover":
          return new RecoverScreen(this, this);
        case "code":
          return new CodeScreen(this);
        default:
          return new CreatorScreen(this, this.meta, {
            api: this.api,
            leave: () => void this.signOut(),
            done: (character) => {
              const account = this.session?.account;
              if (account) this.enterWorld({ account, character });
            },
            dim: (a) => this.backdrop.shade(a),
            look: (up) => this.backdrop.look(up, 600),
          });
      }
    });
    if (next === this.current) return;
    const was = this.current;
    this.current = next;
    if (!was) {
      next.open();
      return;
    }
    // The old sheet is picked up first, so two pages never blur into each other.
    was.close();
    this.time.delayedCall(90, () => {
      if (this.current === next) next.open();
    });
  }
}
