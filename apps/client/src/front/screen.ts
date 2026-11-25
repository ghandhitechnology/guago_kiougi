import type * as Phaser from "phaser";
import { FocusScope, finePointer, popScope, pushScope } from "../ui/focus.ts";
import type { Ctx } from "../ui/widget.ts";

/** One screen of the front end. Its widgets share a focus scope that holds the keyboard. */
export abstract class Screen {
  readonly scope = new FocusScope();
  readonly ctx: Ctx;
  readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.ctx = { scene, scope: this.scope };
  }

  /** Takes the keyboard and shows the screen. */
  open(): void {
    pushScope(this.scope);
    this.enter();
    // With a keyboard, the first thing to fill in has focus at once; on a phone a tap decides.
    const first = this.firstFocus();
    if (first && finePointer()) this.scope.focus(first, "key");
  }

  close(done?: () => void): void {
    popScope(this.scope);
    this.scope.focus(undefined, "pointer");
    this.leave(done);
  }

  protected abstract enter(): void;
  protected abstract leave(done?: () => void): void;
  protected firstFocus(): ReturnType<FocusScope["first"]> {
    return this.scope.first();
  }
}
