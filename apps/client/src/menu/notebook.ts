import type * as Phaser from "phaser";
import { FocusScope, popScope, pushScope } from "../ui/focus.ts";
import { turnPage } from "../ui/motion.ts";
import { Panel } from "../ui/panel.ts";
import { screen } from "../ui/screen.ts";
import { TabRow } from "../ui/tabs.ts";
import type { Ctx } from "../ui/widget.ts";

/**
 * The notebook (PLAN §18): one menu, its tabs added by whichever lane builds them. A tab exists
 * only once something registers it, so the notebook never shows an empty page.
 *
 * ```ts
 * registerMenuTab({ id: "bag", label: "가방", icon: "menu/bag", order: 10, build: (ctx, page, size) => { ... } });
 * ```
 */
export interface MenuTab {
  readonly id: string;
  readonly label: string;
  /** A `menu` frame, shown on the tab beside the label. */
  readonly icon?: string;
  /** Left to right. */
  readonly order: number;
  /** Draws the tab's page into `page`, `size` across and down. Widgets go in `ctx.scope`. */
  build(ctx: Ctx, page: Phaser.GameObjects.Container, size: { w: number; h: number }): void;
}

const tabs: MenuTab[] = [];

export function registerMenuTab(tab: MenuTab): void {
  const i = tabs.findIndex((t) => t.id === tab.id);
  if (i >= 0) tabs.splice(i, 1, tab);
  else tabs.push(tab);
  tabs.sort((a, b) => a.order - b.order);
}

const PW = 320;
const PH = 246;

/** The menu: a notebook page laid over the world, its tabs along the top. */
export class Notebook {
  private readonly scene: Phaser.Scene;
  private readonly onClosed: () => void;
  private panel: Panel | undefined;
  private scope: FocusScope | undefined;
  private page: Phaser.GameObjects.Container | undefined;
  private current = "";
  private closing = false;

  constructor(scene: Phaser.Scene, onClosed: () => void) {
    this.scene = scene;
    this.onClosed = onClosed;
  }

  get isOpen(): boolean {
    return this.panel !== undefined && !this.closing;
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(tabId?: string): void {
    if (this.isOpen || tabs.length === 0) return;
    const scene = this.scene;
    const scope = new FocusScope();
    const ctx: Ctx = { scene, scope };
    const first = tabs.find((t) => t.id === tabId) ?? (tabs[0] as MenuTab);
    this.current = first.id;
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
    }
    const content = scene.add.container(page.x, top);
    panel.add(content);
    this.panel = panel;
    this.scope = scope;
    this.page = content;
    this.closing = false;
    scope.onBack = () => this.close();
    pushScope(scope);
    this.build(first, content, { w: page.w, h: page.h - (top - page.y) });
    panel.open();
    scope.focus(scope.first(), "key");
  }

  close(): void {
    const panel = this.panel;
    if (!panel || this.closing) return;
    this.closing = true;
    if (this.scope) popScope(this.scope);
    panel.hide(() => {
      panel.destroy();
      if (this.panel === panel) {
        this.panel = undefined;
        this.page = undefined;
        this.closing = false;
      }
      this.onClosed();
    });
  }

  private show(id: string): void {
    const tab = tabs.find((t) => t.id === id);
    const page = this.page;
    const panel = this.panel;
    if (!tab || !page || !panel || id === this.current) return;
    this.current = id;
    turnPage(page, () => {
      page.removeAll(true);
      const { page: p } = panel;
      this.build(tab, page, { w: p.w, h: p.h - 18 });
    });
  }

  private build(
    tab: MenuTab,
    into: Phaser.GameObjects.Container,
    size: { w: number; h: number },
  ): void {
    if (!this.scope) return;
    tab.build({ scene: this.scene, scope: this.scope }, into, size);
  }
}

export { PH, PW };
