import type {
  BoardView,
  CodexView,
  LivePush,
  LiveReadKind,
  NotebookView,
  PageView,
  RulesView,
} from "@guago/shared";
import type { LiveCall, WorldLink } from "../world-link.ts";

/**
 * The living world as this player last read it (PLAN §10, §11, §15): the Page, their 수행평가
 * board, their 도감, the 0조 연구노트 and the school rules. Views are read when a screen opens
 * and kept current by the server's pushes; the moments (a notice done, a 도감 unlock, an award)
 * reach whoever listens as they arrive.
 */

type Listener = (state: LiveState, push: LivePush | null) => void;

export class LiveState {
  page: PageView | undefined;
  board: BoardView | undefined;
  codex: CodexView | undefined;
  notebook: NotebookView | undefined;
  rules: RulesView | undefined;
  /** Real ms when `page` was read, to run its clock forward between reads. */
  private pageAt = 0;
  private link: WorldLink | undefined;
  private unlisten: (() => void) | undefined;
  private readonly listeners = new Set<Listener>();

  attach(link: WorldLink): void {
    this.detach();
    this.link = link;
    this.unlisten = link.on((e) => {
      if (e.type === "live") this.take(e.push);
      else if (e.type === "status" && e.status === "online") {
        void this.read("page");
        void this.read("rules");
      }
    });
  }

  detach(): void {
    this.unlisten?.();
    this.unlisten = undefined;
    this.link = undefined;
    this.page = this.board = this.codex = this.notebook = this.rules = undefined;
  }

  watch(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this, null);
    return () => this.listeners.delete(fn);
  }

  /** Asks for a view again; the push that answers it updates the state for every listener. */
  async read(what: LiveReadKind): Promise<LiveCall<unknown>> {
    const link = this.link;
    if (!link) return { ok: false, code: "offline" };
    return link.read(what);
  }

  /** The server clock now, from the last Page read and the rate it runs at. */
  serverNow(): number {
    const p = this.page;
    if (!p) return Date.now();
    return p.now + (Date.now() - this.pageAt) * p.rate;
  }

  /** Server-clock ms as real ms from now: how long until a server time comes. */
  realMsUntil(serverMs: number): number {
    const p = this.page;
    const rate = p?.rate ?? 1;
    return (serverMs - this.serverNow()) / Math.max(1e-9, rate);
  }

  private take(push: LivePush): void {
    switch (push.t) {
      case "page":
        this.page = push.page;
        this.pageAt = Date.now();
        break;
      case "board":
        this.board = push.board;
        break;
      case "codex":
        this.codex = push.codex;
        break;
      case "notebook":
        this.notebook = push.notebook;
        break;
      case "rules":
        this.rules = push.rules;
        break;
      case "done":
        if (this.board) this.board = patchNotice(this.board, push.quest);
        break;
      case "unlock":
        if (this.codex) {
          const now = this.serverNow();
          const have = new Set(this.codex.unlocked.map((u) => u.id));
          this.codex = {
            ...this.codex,
            unlocked: [
              ...this.codex.unlocked,
              ...push.entries.filter((id) => !have.has(id)).map((id) => ({ id, at: now })),
            ],
          };
        }
        break;
      case "help":
        if (this.board) {
          const n = push.notice;
          const help = { ...this.board.help };
          if (help.mine?.id === n.id)
            help.mine = n.state === "open" || n.state === "taken" ? n : null;
          if (help.taken?.id === n.id) help.taken = n.state === "taken" ? n : null;
          help.open = help.open.filter((o) => o.id !== n.id);
          this.board = { ...this.board, help };
        }
        break;
      default:
        break;
    }
    for (const l of this.listeners) l(this, push);
  }
}

function patchNotice(board: BoardView, q: BoardView["daily"][number]): BoardView {
  const swap = (list: BoardView["daily"]) => list.map((n) => (n.id === q.id ? q : n));
  return {
    ...board,
    daily: swap(board.daily),
    weekly: swap(board.weekly),
    story: swap(board.story),
    repeat: board.repeat?.id === q.id ? q : board.repeat,
  };
}

export const live = new LiveState();
