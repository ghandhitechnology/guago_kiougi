import type { ChatLine, SpeakChannel, SystemLine } from "@guago/shared";
import type { Spoken } from "../copy/lines.ts";
import type { WorldLink } from "../world-link.ts";
import { systemLine } from "./copy.ts";

/** The channels a player has a tab for. 파티 and 동아리 show only while the player is in one. */
export const TABS = ["world", "near", "whisper", "party", "club"] as const;
export type Tab = (typeof TABS)[number];

export type Tone = Tab | "system" | "refusal";

export interface LogLine {
  readonly id: number;
  readonly tone: Tone;
  /** Who spoke, for chat lines. */
  readonly from?: { readonly id: string; readonly name: string };
  /** For whispers the player sent: who to. */
  readonly to?: string;
  readonly mine: boolean;
  /** Plain text. Masked words arrive as runs of `*`. */
  readonly text: string;
}

const KEEP = 300;

const isTab = (ch: SpeakChannel): ch is Tab => (TABS as readonly string[]).includes(ch);

/**
 * Everything said to this player since joining, by tab. System lines and refusals show on every
 * tab; a chat line on a tab not being read marks that tab unread.
 */
export class ChatLog {
  private readonly lines: LogLine[] = [];
  private readonly listeners = new Set<() => void>();
  private readonly lineListeners = new Set<(line: LogLine) => void>();
  private readonly announceListeners = new Set<(line: Spoken) => void>();
  readonly unread = new Set<Tab>();
  active: Tab = "near";
  private counter = 0;
  private readonly unlisten: () => void;

  constructor(link: WorldLink) {
    this.unlisten = link.on((e) => {
      if (e.type === "chat") this.chat(e.line, e.mine);
      else if (e.type === "system") this.system(e.line);
    });
  }

  dispose(): void {
    this.unlisten();
    this.listeners.clear();
    this.lineListeners.clear();
    this.announceListeners.clear();
  }

  on(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Calls `fn` with each server announcement, which gets a banner before it settles here. */
  onAnnounce(fn: (line: Spoken) => void): () => void {
    this.announceListeners.add(fn);
    return () => this.announceListeners.delete(fn);
  }

  /** Calls `fn` with every line as it arrives, for the feed over the world. */
  onLine(fn: (line: LogLine) => void): () => void {
    this.lineListeners.add(fn);
    return () => this.lineListeners.delete(fn);
  }

  /** The lines a tab shows, oldest first. */
  linesFor(tab: Tab): LogLine[] {
    return this.lines.filter((l) => l.tone === tab || l.tone === "system" || l.tone === "refusal");
  }

  setActive(tab: Tab): void {
    this.active = tab;
    this.unread.delete(tab);
    this.emit();
  }

  /** A refusal or status, in the school's voice, on every tab. */
  note(text: string, tone: "refusal" | "system" = "refusal"): void {
    this.add({ id: --this.counter, tone, mine: false, text });
  }

  private chat(line: ChatLine, mine: boolean): void {
    if (!isTab(line.ch)) return;
    const tab = line.ch;
    this.add({
      id: line.id,
      tone: tab,
      from: { id: line.from.id, name: line.from.name },
      ...(mine && line.to ? { to: line.to.name } : {}),
      mine,
      text: line.text,
    });
    if (tab !== this.active) {
      this.unread.add(tab);
      this.emit();
    }
  }

  private system(line: SystemLine): void {
    const said = systemLine(line);
    if (!said) return;
    if (said.announcement) for (const l of this.announceListeners) l(said);
    this.add({ id: line.id, tone: "system", mine: false, text: said.text });
  }

  private add(line: LogLine): void {
    this.lines.push(line);
    if (this.lines.length > KEEP) this.lines.splice(0, this.lines.length - KEEP);
    this.emit();
    for (const l of this.lineListeners) l(line);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}
