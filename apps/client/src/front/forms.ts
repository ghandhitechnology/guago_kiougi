import { checkLoginId, checkPassword } from "@guago/shared";
import type * as Phaser from "phaser";
import { type Backend, errorCode, errorText, type Session } from "../backend/index.ts";
import { t } from "../i18n/index.ts";
import { Button } from "../ui/button.ts";
import { Checkbox } from "../ui/checkbox.ts";
import { layDown, pickUp, shake, stamp } from "../ui/motion.ts";
import { toast } from "../ui/overlay.ts";
import { Panel } from "../ui/panel.ts";
import { sound } from "../ui/sound.ts";
import { Label } from "../ui/text.ts";
import { FIELD_LABEL_H, TextField } from "../ui/textfield.ts";
import { sliceOf } from "../ui/theme.ts";
import { Screen } from "./screen.ts";

const W = 480;
const H = 270;
const FIELD_H = 20;
const GAP = 5;
/** Room for two lines of the office's refusal. */
const ERROR_H = 26;

/** What the front end's screens can ask of the scene that runs them. */
export interface Flow {
  readonly api: Backend;
  title(): void;
  login(loginId?: string): void;
  signup(): void;
  recover(): void;
  /** Signed up and signed in: show the recovery code, then the creator. */
  signedUp(session: Session, code: string): void;
  /** A new password set with the recovery code: show the new code, then sign in. */
  recovered(loginId: string, code: string): void;
  /** Signed in: on to the creator, or into the world when a character exists. */
  signedIn(session: Session): void;
  /** Still signed in from last time, with a character: back into the world on one press. */
  readonly returning: boolean;
  resume(): void;
}

/**
 * A form on a notebook page: fields stacked down the page, an error line kept free above the
 * buttons, and the main action at the bottom right.
 */
abstract class FormScreen extends Screen {
  protected readonly flow: Flow;
  protected panel!: Panel;
  protected error!: Label;
  private errorRest = { x: 0, y: 0 };
  protected busy = false;

  constructor(scene: Phaser.Scene, flow: Flow) {
    super(scene);
    this.flow = flow;
  }

  /** Builds the page: `rows` is the height of the fields; returns where they start. */
  protected page(title: string, w: number, rows: number): { x: number; y: number; w: number } {
    const h = 23 + 8 + rows + 4 + ERROR_H + 4 + 21 + 9;
    const x = Math.round((W - w) / 2);
    const y = H - h - 6;
    this.panel = new Panel(this.ctx, x, y, w, h, { title, onClose: () => this.back() });
    const { page } = this.panel;
    const errY = page.y + 8 + rows + 4;
    this.error = new Label(this.scene, page.x + 8, errY + 2, "", {
      font: "galmuri9",
      color: "red.mid",
      width: page.w - 16,
    });
    this.errorRest = { x: this.error.obj.x, y: this.error.obj.y };
    this.panel.add(this.error.obj);
    this.scope.onBack = () => this.back();
    return { x: page.x + 8, y: page.y + 8, w: page.w - 16 };
  }

  /** The main action at the bottom right of the page. */
  protected submitButton(label: string, onPress: () => void): Button {
    const { page } = this.panel;
    const b = new Button(this.ctx, 0, page.y + page.h - 9 - 21, {
      label,
      kind: "ink",
      w: 64,
      sound: "confirm",
      onPress,
    });
    b.setX(page.x + page.w - 8 - 64);
    this.panel.add(b);
    return b;
  }

  /** A word at the bottom left of the page, for the way out sideways. */
  protected sideButton(label: string, onPress: () => void): Button {
    const { page } = this.panel;
    const b = new Button(this.ctx, page.x + 8, page.y + page.h - 9 - 17, {
      label,
      kind: "text",
      onPress,
    });
    this.panel.add(b);
    return b;
  }

  protected field(
    x: number,
    y: number,
    w: number,
    label: string,
    opts: Partial<ConstructorParameters<typeof TextField>[3]> = {},
  ): TextField {
    const f = new TextField(this.ctx, x, y, {
      label,
      w,
      h: FIELD_H,
      onSubmit: () => this.scope.handle("next"),
      ...opts,
    });
    this.panel.add(f);
    return f;
  }

  protected say(text: string, culprit?: { reject(): void } | Checkbox): void {
    this.error.set(text);
    if (!text) return;
    sound("error");
    shake(this.error.obj, this.errorRest);
    if (culprit && "reject" in culprit) culprit.reject();
    else if (culprit) shake(culprit, { x: culprit.x, y: culprit.y });
  }

  /** Runs a request with the form locked, and shows any refusal. */
  protected async send<T>(
    button: Button,
    run: () => Promise<T>,
    culpritOf: (code: string) => { reject(): void } | undefined,
  ): Promise<T | undefined> {
    if (this.busy) return undefined;
    this.busy = true;
    button.setEnabled(false);
    this.say("");
    try {
      return await run();
    } catch (e) {
      this.say(errorText(e), culpritOf(errorCode(e)));
      return undefined;
    } finally {
      this.busy = false;
      button.setEnabled(true);
    }
  }

  protected enter(): void {
    this.say("");
    this.panel.open();
  }

  protected leave(done?: () => void): void {
    this.panel.hide(done);
  }

  protected back(): void {
    this.flow.title();
  }
}

/** Returning students: ID and password. */
export class LoginScreen extends FormScreen {
  private readonly id: TextField;
  private readonly password: TextField;
  private readonly go: Button;

  constructor(scene: Phaser.Scene, flow: Flow) {
    super(scene, flow);
    const rows = (FIELD_LABEL_H + FIELD_H) * 2 + GAP;
    const at = this.page(t("login.title"), 210, rows);
    this.id = this.field(at.x, at.y, at.w, t("login.id"), {
      autocomplete: "username",
      maxLength: 16,
    });
    this.password = this.field(
      at.x,
      at.y + FIELD_LABEL_H + FIELD_H + GAP,
      at.w,
      t("login.password"),
      {
        password: true,
        autocomplete: "current-password",
        maxLength: 64,
        enterKeyHint: "go",
        onSubmit: () => void this.submit(),
      },
    );
    this.sideButton(t("login.lost"), () => flow.recover());
    this.go = this.submitButton(t("login.submit"), () => void this.submit());
  }

  prefill(loginId: string | undefined): void {
    if (loginId !== undefined) this.id.value = loginId;
    this.password.value = "";
  }

  private async submit(): Promise<void> {
    const loginId = this.id.value.trim();
    if (!loginId) {
      this.say(t("error.id_required"), this.id);
      this.scope.focus(this.id);
      return;
    }
    const session = await this.send(
      this.go,
      () => this.flow.api.login(loginId, this.password.value),
      (code) => (code === "bad_credentials" ? this.password : undefined),
    );
    if (session) this.flow.signedIn(session);
    else if (!this.busy) this.password.value = "";
  }
}

/** New students: the 입학 원서. */
export class SignupScreen extends FormScreen {
  private readonly id: TextField;
  private readonly password: TextField;
  private readonly age: Checkbox;
  private readonly go: Button;

  constructor(scene: Phaser.Scene, flow: Flow) {
    super(scene, flow);
    const rows = (FIELD_LABEL_H + FIELD_H) * 2 + GAP + 6 + 16;
    const at = this.page(t("signup.title"), 210, rows);
    this.id = this.field(at.x, at.y, at.w, t("signup.id"), {
      autocomplete: "username",
      maxLength: 16,
    });
    const py = at.y + FIELD_LABEL_H + FIELD_H + GAP;
    this.password = this.field(at.x, py, at.w, t("signup.password"), {
      password: true,
      autocomplete: "new-password",
      maxLength: 64,
    });
    this.age = new Checkbox(this.ctx, at.x, py + FIELD_LABEL_H + FIELD_H + 6, {
      label: t("signup.age"),
    });
    this.panel.add(this.age);
    this.go = this.submitButton(t("signup.submit"), () => void this.submit());
  }

  /** Every 입학 원서 starts blank. */
  protected override enter(): void {
    this.id.value = "";
    this.password.value = "";
    this.age.checked = false;
    super.enter();
  }

  private async submit(): Promise<void> {
    const loginId = this.id.value.trim();
    if (!loginId) {
      this.say(t("error.id_required"), this.id);
      return;
    }
    // The shared rules answer before the server is asked.
    const idError = checkLoginId(loginId);
    if (idError) {
      this.say(t(`error.${idError}`), this.id);
      return;
    }
    const pwError = checkPassword(this.password.value);
    if (pwError) {
      this.say(t(`error.${pwError}`), this.password);
      return;
    }
    if (!this.age.checked) {
      this.say(t("error.age_required"), this.age);
      return;
    }
    const password = this.password.value;
    const res = await this.send(
      this.go,
      async () => {
        const { recoveryCode } = await this.flow.api.signup(loginId, password, this.age.checked);
        // Signup sets the session cookie; signing in again covers a server that did not.
        const session =
          (await this.flow.api.me()) ?? (await this.flow.api.login(loginId, password));
        return { recoveryCode, session };
      },
      (code) =>
        code === "login_taken" ? this.id : code === "weak_password" ? this.password : undefined,
    );
    if (res) {
      this.password.value = "";
      this.flow.signedUp(res.session, res.recoveryCode);
    }
  }
}

/** 분실 신고: a new password against the recovery code. */
export class RecoverScreen extends FormScreen {
  private readonly id: TextField;
  private readonly code: TextField;
  private readonly password: TextField;
  private readonly go: Button;

  constructor(scene: Phaser.Scene, flow: Flow) {
    super(scene, flow);
    const step = FIELD_LABEL_H + FIELD_H + GAP;
    const at = this.page(t("recover.title"), 210, step * 3 - GAP);
    this.id = this.field(at.x, at.y, at.w, t("recover.id"), {
      autocomplete: "username",
      maxLength: 16,
    });
    this.code = this.field(at.x, at.y + step, at.w, t("recover.code"), { maxLength: 24 });
    this.password = this.field(at.x, at.y + step * 2, at.w, t("recover.password"), {
      password: true,
      autocomplete: "new-password",
      maxLength: 64,
      enterKeyHint: "go",
      onSubmit: () => void this.submit(),
    });
    this.go = this.submitButton(t("recover.submit"), () => void this.submit());
  }

  protected override back(): void {
    this.flow.login();
  }

  private async submit(): Promise<void> {
    const loginId = this.id.value.trim();
    const code = this.code.value.trim();
    if (!loginId) return this.say(t("error.id_required"), this.id);
    if (!code) return this.say(t("error.code_required"), this.code);
    const pwError = checkPassword(this.password.value);
    if (pwError) return this.say(t(`error.${pwError}`), this.password);
    const done = await this.send(
      this.go,
      () => this.flow.api.recover(loginId, code, this.password.value),
      (c) =>
        c === "bad_credentials" ? this.code : c === "weak_password" ? this.password : undefined,
    );
    if (done) {
      this.code.value = "";
      this.password.value = "";
      this.flow.recovered(loginId, done.recoveryCode);
    }
  }
}

/**
 * The recovery code, shown once. It lands as a sticky note stamped onto the page; the only way
 * on is to say it has been written down.
 */
export class CodeScreen extends Screen {
  private readonly panel: Panel;
  private readonly note: Phaser.GameObjects.Container;
  private readonly noteRest: { x: number; y: number };
  private readonly codeText: Label;
  private readonly done: Button;
  private code = "";
  private onDone: (() => void) | undefined;

  constructor(scene: Phaser.Scene) {
    super(scene);
    const w = 260;
    const body = new Label(scene, 0, 0, t("code.body"), {
      font: "galmuri11",
      width: w - 30,
      leading: 2,
    });
    const noteH = 30;
    const h = 23 + 10 + body.height + 10 + noteH + 12 + 21 + 9;
    const x = Math.round((W - w) / 2);
    const y = Math.round((H - h) / 2) + 20;
    this.panel = new Panel(this.ctx, x, y, w, h, { title: t("code.title") });
    const { page } = this.panel;
    body.at(page.x + 8, page.y + 10);
    body.color("ink.dark");
    this.panel.add(body.obj);

    // The note, stuck on the page.
    const noteY = page.y + 10 + body.height + 8;
    const noteW = page.w - 40;
    const [l, r, tt, b] = sliceOf("tooltip");
    const paper = scene.add
      .nineslice(0, 0, "ui", "tooltip/idle", noteW, noteH, l, r, tt, b)
      .setOrigin(0);
    this.codeText = new Label(scene, 0, 0, "", { font: "galmuri11-bold", color: "ink.dark" });
    this.note = scene.add.container(0, 0, [paper, this.codeText.obj]);
    this.noteRest = { x: page.x + 20, y: noteY };
    this.note.setPosition(this.noteRest.x, this.noteRest.y);
    this.panel.add(this.note);

    const by = page.y + page.h - 9 - 21;
    const copy = new Button(this.ctx, page.x + 8, by, {
      label: t("code.copy"),
      onPress: () => void this.copy(),
    });
    this.done = new Button(this.ctx, 0, by, {
      label: t("code.done"),
      kind: "ink",
      sound: "confirm",
      onPress: () => this.onDone?.(),
    });
    this.done.setX(page.x + page.w - 8 - this.done.size().w);
    this.panel.add([copy, this.done]);
  }

  show(code: string, onDone: () => void): void {
    this.code = code;
    this.onDone = onDone;
    this.codeText.set(code);
    const nw = this.panel.page.w - 40;
    this.codeText.at(Math.floor((nw - this.codeText.width) / 2), 9);
  }

  protected enter(): void {
    this.panel.open(() => {
      sound("stamp");
      stamp(this.note, this.noteRest);
    });
    this.note.setVisible(false);
  }

  protected leave(done?: () => void): void {
    this.panel.hide(done);
  }

  protected override firstFocus() {
    return this.done;
  }

  private async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.code);
      toast(t("code.copied"));
    } catch {
      // No clipboard (insecure origin or denied): the code is on screen to write down.
      sound("error");
    }
  }
}

/**
 * The title's doors: back to school, or in for the first time. A player still signed in from last
 * time gets one door, 이어하기, and that press is also what lets the game's sound start.
 */
export class TitleScreen extends Screen {
  private readonly buttons: Phaser.GameObjects.Container;
  private readonly login: Button;
  private readonly rest: { x: number; y: number };

  constructor(scene: Phaser.Scene, flow: Flow) {
    super(scene);
    if (flow.returning) {
      const w = 112;
      this.login = new Button(this.ctx, 0, 0, {
        label: t("title.continue"),
        kind: "ink",
        w,
        h: 23,
        sound: "confirm",
        onPress: () => flow.resume(),
      });
      this.rest = { x: Math.round((W - w) / 2), y: 222 };
      this.buttons = scene.add.container(this.rest.x, this.rest.y, [this.login]);
      this.buttons.setVisible(false);
      return;
    }
    const w = 84;
    const gap = 10;
    this.login = new Button(this.ctx, 0, 0, {
      label: t("title.login"),
      kind: "ink",
      w,
      h: 23,
      sound: "confirm",
      onPress: () => flow.login(),
    });
    const signup = new Button(this.ctx, w + gap, 0, {
      label: t("title.signup"),
      w,
      h: 23,
      onPress: () => flow.signup(),
    });
    this.rest = { x: Math.round((W - (w * 2 + gap)) / 2), y: 222 };
    this.buttons = scene.add.container(this.rest.x, this.rest.y, [this.login, signup]);
    this.buttons.setVisible(false);
  }

  protected enter(): void {
    layDown(this.buttons, this.rest);
  }

  protected leave(done?: () => void): void {
    pickUp(this.buttons, this.rest, done);
  }

  protected override firstFocus() {
    return this.login;
  }
}
