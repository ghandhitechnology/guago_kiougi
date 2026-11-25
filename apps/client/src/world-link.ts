/**
 * The WorldRoom connection (PLAN §12, §19): presence and chat for the whole session, beside the
 * map room. No UI here; the chat panel and speech bubbles subscribe with `on`.
 *
 * Chat text from the server is plain text. Render it as text only, never as HTML and never
 * with links made clickable (PLAN §12, §22).
 *
 * Echo policy: nothing is shown before the server answers. `send` resolves with the line as the
 * server delivered it (masked by the filter, with its id and time) or with a refusal code. The
 * server may mask, refuse or mute, so an optimistic copy could show words nobody else saw; the
 * round trip is one hop on an open socket, and the input can show the pending text meanwhile.
 */
import { Client, type Room } from "@colyseus/sdk";
import {
  type ChatLine,
  type ChatSend,
  CLOSE_SESSION_REPLACED,
  cleanChatText,
  type PresenceEntry,
  type PresenceMessage,
  type Refusal,
  type RefusalCode,
  ROOMS_PATH,
  type SpeakChannel,
  type SystemLine,
  WORLD_MESSAGES,
  WORLD_ROOM,
  whisperTarget,
} from "@guago/shared";

export type WorldStatus =
  /** Joining, or waiting to join again after the room closed. */
  | "connecting"
  | "online"
  /** The socket dropped; the SDK is bringing the same seat back. */
  | "reconnecting"
  /** The account joined somewhere else. Final: show it and offer a fresh start. */
  | "replaced"
  /** No session or no character. Final. */
  | "signedOut"
  /** `close()` was called. Final. */
  | "closed";

/** Refusals from the server, plus `offline` (not connected) and `timeout` (no answer). */
export type SendCode = RefusalCode | "offline" | "timeout";

export type SendResult =
  | { ok: true; line: ChatLine }
  | { ok: false; code: SendCode; until?: number; retryMs?: number; need?: number };

export type PresenceChange =
  /** The whole list was replaced (after joining or rejoining). */
  | { kind: "reset" }
  | { kind: "join"; entry: PresenceEntry }
  | { kind: "leave"; entry: PresenceEntry }
  /** Map or level changed; `entry` holds the new values. */
  | { kind: "update"; entry: PresenceEntry };

export type WorldEvent =
  | { type: "status"; status: WorldStatus }
  | { type: "presence"; change: PresenceChange }
  /** `mine` is true for the player's own lines, which also resolve their `send`. */
  | { type: "chat"; line: ChatLine; mine: boolean }
  | { type: "system"; line: SystemLine };

export interface WorldLink {
  readonly status: WorldStatus;
  /** Everyone online, by character id, the player included. */
  readonly presence: ReadonlyMap<string, PresenceEntry>;
  /** The player's own character id, once joined. */
  readonly me: string | undefined;
  /** Subscribes to every event; returns the unsubscribe. */
  on(listener: (event: WorldEvent) => void): () => void;
  /** `target` is the character name for `whisper`. */
  send(channel: SpeakChannel, text: string, target?: string): Promise<SendResult>;
  close(): Promise<void>;
}

/** How long `send` waits for the server before answering `timeout`. */
const SEND_TIMEOUT_MS = 8000;
const FIRST_RETRY_MS = 1000;
/** Line ids remembered to drop the repeats the server replays after a reconnect. */
const SEEN_LINES = 256;
const MAX_RETRY_MS = 8000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Matchmaking and sockets go through the page's own origin, so the session cookie rides along. */
function defaultEndpoint(): string {
  return `${location.origin}${ROOMS_PATH}`;
}

/**
 * Joins the WorldRoom and keeps it joined until replaced, signed out or closed. `sdk` is passed
 * to the Colyseus client (headless bots send the session cookie through it).
 */
export function connectWorld(
  endpoint = defaultEndpoint(),
  sdk?: ConstructorParameters<typeof Client>[1],
): WorldLink {
  const client = new Client(endpoint, sdk);
  const listeners = new Set<(event: WorldEvent) => void>();
  const presence = new Map<string, PresenceEntry>();
  const pending = new Map<
    number,
    { resolve: (r: SendResult) => void; timer: ReturnType<typeof setTimeout> | undefined }
  >();
  const seen = new Set<number>();
  let status: WorldStatus = "connecting";
  let me: string | undefined;
  let room: Room | undefined;
  let stopped = false;
  let counter = 0;

  const emit = (event: WorldEvent) => {
    for (const listener of listeners) listener(event);
  };
  const setStatus = (next: WorldStatus) => {
    if (status === next) return;
    status = next;
    emit({ type: "status", status });
  };
  const arm = (n: number) =>
    setTimeout(() => settle(n, { ok: false, code: "timeout" }), SEND_TIMEOUT_MS);
  /** False for a line already shown: the server replays answers after a reconnect. */
  const fresh = (id: number) => {
    if (seen.has(id)) return false;
    seen.add(id);
    if (seen.size > SEEN_LINES) seen.delete(seen.values().next().value as number);
    return true;
  };
  const settle = (n: number, result: SendResult) => {
    const p = pending.get(n);
    if (!p) return;
    pending.delete(n);
    clearTimeout(p.timer);
    p.resolve(result);
  };

  function onPresence(m: PresenceMessage): void {
    if (m.t === "all") {
      me = m.you;
      presence.clear();
      for (const entry of m.list) presence.set(entry.id, entry);
      emit({ type: "presence", change: { kind: "reset" } });
    } else if (m.t === "join") {
      presence.set(m.p.id, m.p);
      emit({ type: "presence", change: { kind: "join", entry: m.p } });
    } else if (m.t === "leave") {
      const entry = presence.get(m.id);
      if (!entry) return;
      presence.delete(m.id);
      emit({ type: "presence", change: { kind: "leave", entry } });
    } else {
      const entry = presence.get(m.id);
      if (!entry) return;
      const next =
        m.t === "map" ? { ...entry, map: m.map, ch: m.ch } : { ...entry, level: m.level };
      presence.set(m.id, next);
      emit({ type: "presence", change: { kind: "update", entry: next } });
    }
  }

  function attach(joined: Room): void {
    joined.onMessage(WORLD_MESSAGES.presence, onPresence);
    joined.onMessage(WORLD_MESSAGES.chat, (line: ChatLine) => {
      const mine = line.from.id === me;
      if (fresh(line.id)) emit({ type: "chat", line, mine });
      if (mine && line.n !== undefined) settle(line.n, { ok: true, line });
    });
    joined.onMessage(WORLD_MESSAGES.system, (line: SystemLine) => {
      if (fresh(line.id)) emit({ type: "system", line });
    });
    joined.onMessage(WORLD_MESSAGES.refused, (r: Refusal) => {
      if (r.type !== WORLD_MESSAGES.chat || r.n === undefined) return;
      const { code, until, retryMs, need } = r;
      settle(r.n, {
        ok: false,
        code,
        ...(until === undefined ? {} : { until }),
        ...(retryMs === undefined ? {} : { retryMs }),
        ...(need === undefined ? {} : { need }),
      });
    });
    // While the socket is down an answer cannot arrive; the clock restarts once it is back, and
    // the server then replays the answers the drop swallowed.
    joined.onDrop(() => {
      for (const p of pending.values()) clearTimeout(p.timer);
      setStatus("reconnecting");
    });
    joined.onReconnect(() => {
      for (const [n, p] of pending) p.timer = arm(n);
      setStatus("online");
    });
  }

  async function run(): Promise<void> {
    let wait = FIRST_RETRY_MS;
    while (!stopped) {
      setStatus("connecting");
      let joined: Room;
      try {
        joined = await client.joinOrCreate(WORLD_ROOM);
      } catch (error) {
        const code = (error as { code?: unknown }).code;
        const final = code === 401 || code === 403 ? "signedOut" : code === 409 ? "replaced" : null;
        if (final) {
          setStatus(final);
          return;
        }
        await sleep(wait);
        wait = Math.min(wait * 2, MAX_RETRY_MS);
        continue;
      }
      if (stopped) {
        await joined.leave();
        break;
      }
      wait = FIRST_RETRY_MS;
      // A fresh room numbers its lines from the start again.
      seen.clear();
      room = joined;
      attach(joined);
      setStatus("online");
      const code = await new Promise<number>((resolve) => joined.onLeave((c) => resolve(c)));
      room = undefined;
      for (const n of [...pending.keys()]) settle(n, { ok: false, code: "offline" });
      if (code === CLOSE_SESSION_REPLACED) {
        setStatus("replaced");
        return;
      }
      if (!stopped) await sleep(wait);
    }
    setStatus("closed");
  }

  void run();

  return {
    get status() {
      return status;
    },
    presence,
    get me() {
      return me;
    },
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send(channel, text, target) {
      const cleaned = cleanChatText(text);
      if (!cleaned.ok) return Promise.resolve({ ok: false, code: cleaned.code });
      const to = channel === "whisper" ? whisperTarget(target ?? "") : undefined;
      if (channel === "whisper" && to === undefined) {
        return Promise.resolve({ ok: false, code: "target_offline" });
      }
      const open = room;
      if (!open || status !== "online") return Promise.resolve({ ok: false, code: "offline" });
      const n = ++counter;
      const message: ChatSend = {
        ch: channel,
        text: cleaned.text,
        n,
        ...(to === undefined ? {} : { to }),
      };
      return new Promise<SendResult>((resolve) => {
        pending.set(n, { resolve, timer: arm(n) });
        open.send(WORLD_MESSAGES.chat, message);
      });
    },
    async close() {
      stopped = true;
      await room?.leave();
      setStatus("closed");
    },
  };
}
