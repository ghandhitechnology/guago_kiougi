import * as Phaser from "phaser";
import { FocusScope, popScope, pushScope } from "../ui/focus.ts";
import { fade, turnPage } from "../ui/motion.ts";
import { Panel } from "../ui/panel.ts";
import { screen } from "../ui/screen.ts";
import { TabRow } from "../ui/tabs.ts";
import { paint } from "../ui/theme.ts";
import type { Ctx } from "../ui/widget.ts";

/**
 * The notebook (PLAN §18): one menu, its tabs added by whichever lane builds them. A tab exists
 * only once something registers it, so the notebook never shows an empty page. It closes with
 * Escape, its cross, or a tap anywhere outside it.
 *
 * ```ts
 * registerMenuTab({ id: "bag", label: "가방", icon: "menu/bag", order: 10, build: (ctx, page, size, arg) => { ... } });
 * menu.open("bag", { station: "bindery" });   // from a thing in the world that owns a screen
 * ```
 */
export interface MenuTab {
  readonly id: string;
  readonly label: string;
  /** A `menu` frame, shown on the tab beside the label. */
  readonly icon?: string;
  /** Left to right. */
  readonly order: number;
  /**
   * Draws the tab's page into `page`, `size` across and down. Widgets go in `ctx.scope`. `arg` is
   * whatever opened it asked for (a station, an entry), absent when opened from its tab.
   */
  build(
    ctx: Ctx,
    page: Phaser.GameObjects.Container,
    size: { w: number; h: number },
    arg?: unknown,
  ): void;
}

const tabs: MenuTab[] = [];

export function registerMenuTab(tab: MenuTab): void {
  const i = tabs.findIndex((t) => t.id === tab.id);
  if (i >= 0) tabs.splice(i, 1, tab);
  else tabs.push(tab);
  tabs.sort((a, b) => a.order - b.order);
}

const PW = 440;
const PH = 246;

/** The notebook open in the world, for screens that open a tab or close it. */
export const menu = {
  current: undefined as Notebook | undefined,
  open(tab: string, arg?: unknown): void {
    menu.current?.open(tab, arg);
  },
  close(): void {
    menu.current?.close();
  },
};

/** The menu: a notebook page laid over the world, its tabs along the top. */
export class Notebook {
  private readonly scene: Phaser.Scene;
  private readonly onOpened: () => void;
  private readonly onClosed: () => void;
  private panel: Panel | undefined;
  private outside: Phaser.GameObjects.Rectangle | undefined;
  private row: TabRow | undefined;
  private scope: FocusScope | undefined;
  private page: Phaser.GameObjects.Container | undefined;
  private current = "";
  private closing = false;

  constructor(scene: Phaser.Scene, onClosed: () => void, onOpened: () => void = () => {}) {
    this.scene = scene;
    this.onClosed = onClosed;
    this.onOpened = onOpened;
    menu.current = this;
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (menu.current === this) menu.current = undefined;
    });
  }

  get isOpen(): boolean {
    return this.panel !== undefined && !this.closing;
  }

  get openTab(): string | undefined {
    return this.isOpen ? this.current : undefined;
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  /** Opens on a tab (the first by default); already open, it turns to that tab. */
  open(tabId?: string, arg?: unknown): void {
    if (tabs.length === 0) return;
    if (this.isOpen) {
      if (tabId) this.show(tabId, arg, true);
      return;
    }
    const scene = this.scene;
    const scope = new FocusScope();
    const ctx: Ctx = { scene, scope };
    const first = tabs.find((t) => t.id === tabId) ?? (tabs[0] as MenuTab);
    this.current = first.id;
    // A tap outside the notebook closes it; nothing under it takes the tap.
    const outside = scene.add
      .rectangle(0, 0, screen.w, screen.h, paint("ink.deep"))
      .setOrigin(0)
      .setAlpha(0)
      .setDepth(799)
      .setInteractive();
    outside.on("pointerup", () => this.close());
    fade(outside, 0.35, 160);
    this.outside = outside;
    // With one tab its name is the notebook's title; tabs appear once there are two.
    const titled = tabs.length === 1;
    const panel = new Panel(
      ctx,
      Math.round((screen.w - PW) / 2),
      Math.round((screen.h - PH) / 2) + 6,
      PW,
      PH,
      {
        ...(titled ? { title: first.label } : {}),
        onClose: () => this.close(),
      },
    ).setDepth(800);
    const { page } = panel;
    const top = titled ? page.y : page.y + 18;
    if (!titled) {
      const row = new TabRow(ctx, page.x + 6, page.y + 2, {
        tabs: tabs.map((t) => ({ id: t.id, label: t.label })),
        selected: first.id,
        onChange: (id) => this.show(id),
      });
      panel.add(row);
      this.row = row;
    }
    const content = scene.add.container(page.x, top);
    panel.add(content);
    this.panel = panel;
    this.scope = scope;
    this.page = content;
    this.closing = false;
    scope.onBack = () => this.close();
    pushScope(scope);
    this.build(first, content, { w: page.w, h: page.h - (top - page.y) }, arg);
    panel.open();
    this.onOpened();
    scope.focus(scope.first(), "key");
  }

  close(): void {
    const panel = this.panel;
    if (!panel || this.closing) return;
    this.closing = true;
    if (this.scope) popScope(this.scope);
    const outside = this.outside;
    this.outside = undefined;
    if (outside) fade(outside, 0, 120, () => outside.destroy());
    panel.hide(() => {
      panel.destroy();
      if (this.panel === panel) {
        this.panel = undefined;
        this.page = undefined;
        this.row = undefined;
        this.closing = false;
      }
      this.onClosed();
    });
  }

  private show(id: string, arg?: unknown, select = false): void {
    const tab = tabs.find((t) => t.id === id);
    const page = this.page;
    const panel = this.panel;
    if (!tab || !page || !panel) return;
    if (id === this.current && arg === undefined) return;
    this.current = id;
    if (select) this.row?.select(id, true);
    turnPage(page, () => {
      page.removeAll(true);
      const { page: p } = panel;
      this.build(tab, page, { w: p.w, h: p.h - (this.row ? 18 : 0) }, arg);
    });
  }

  private build(
    tab: MenuTab,
    into: Phaser.GameObjects.Container,
    size: { w: number; h: number },
    arg?: unknown,
  ): void {
    if (!this.scope) return;
    tab.build({ scene: this.scene, scope: this.scope }, into, size, arg);
  }
}

export { PH, PW };
