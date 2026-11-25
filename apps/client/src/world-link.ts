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
 *
 * Item and currency operations (`op`) carry an operation id and resolve with the one `result`
 * the server gives that id. After `offline` or `timeout`, send again with the same id: the server
 * answers a known id with its recorded result and never applies it twice.
 *
 * Social (friends, blocks, parties, 동아리, 대자보, reports, emotes): `social` holds the player's
 * state from the login snapshot, kept current by the server's events; each change is also
 * emitted as a `social` event. `request` sends one social request and resolves with its one
 * answer. Names and text are checked here first, so a request the server would treat as
 * malformed is answered locally and never sent.
 */
import { Client, type Room } from "@colyseus/sdk";
import {
  type Applicant,
  BOARD_POST_LENGTH,
  type BoardData,
  type BoardMessageName,
  type BoardRequests,
  type ChangeNotice,
  type ChatLine,
  type ChatSend,
  CLUB_NOTICE_LENGTH,
  type ClubApplication,
  type ClubInvite,
  type ClubView,
  CONTROL_MODES,
  cleanChatText,
  cleanText,
  closeEnd,
  type Done,
  type FriendEntry,
  type FriendRequest,
  type HelpTemplate,
  isPlayerName,
  isSocialType,
  LIVE_MESSAGES,
  type LivePush,
  type LiveReadKind,
  type OpName,
  type OpRequests,
  type OpResult,
  type PartyInvite,
  type PartyView,
  type Person,
  type PresenceEntry,
  type PresenceMessage,
  REPORT_NOTE_LENGTH,
  type Refusal,
  type RefusalCode,
  ResultLog,
  ROOMS_PATH,
  SOCIAL_OP_ID,
  type SocialEvent,
  type SocialRequests,
  type SocialSnapshot,
  type SocialType,
  type SpeakChannel,
  type SystemLine,
  type TradeMessageName,
  type TradeRequests,
  type TradeUpdate,
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
  /** An admin closed the session (`CLOSE_KICKED`). Final; logging in again works. */
  | "kicked"
  /** The account was banned (`CLOSE_BANNED`). Final; logging in answers `account_banned`. */
  | "banned"
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

/**
 * Every request in the social shape (`n`, then one `done` or `refused`): the social systems',
 * direct trade's and the 매점 게시판's reads, each with what its `done` carries.
 */
export type Requests = { [K in SocialType]: SocialRequests[K] } & {
  [K in TradeMessageName]: { req: TradeRequests[K]; done: { session: string } };
} & { [K in BoardMessageName]: { req: BoardRequests[K]; done: BoardData[K] } };
export type RequestType = keyof Requests;

/** A request's answer: its data, or why it was not carried out. */
export type RequestResult<K extends RequestType> =
  | { ok: true; data: Requests[K]["done"] }
  | { ok: false; code: SendCode; retryMs?: number; need?: number };

/** The player's social state, as the server last told it. */
export interface SocialState {
  /** By character id. */
  friends: Map<string, FriendEntry>;
  requests: { in: FriendRequest[]; out: FriendRequest[] };
  /** By character id. */
  blocks: Map<string, Person>;
  party: PartyView | null;
  partyInvites: PartyInvite[];
  club: ClubView | null;
  clubInvites: ClubInvite[];
  applications: ClubApplication[];
  /** Empty unless 짱 or 부짱. */
  applicants: Applicant[];
}

/** A friend with what presence knows: online, the map and the live level. */
export interface FriendStatus extends FriendEntry {
  online: boolean;
  map: string;
}

/** An operation's result, or why none arrived. */
export type OpCall = OpResult | { id: string; op: OpName; ok: false; error: "offline" | "timeout" };

export type WorldEvent =
  | { type: "status"; status: WorldStatus }
  | { type: "presence"; change: PresenceChange }
  /** `mine` is true for the player's own lines, which also resolve their `send`. */
  | { type: "chat"; line: ChatLine; mine: boolean }
  | { type: "system"; line: SystemLine }
  /** Every operation result once, including those of calls made before a reconnect. */
  | { type: "result"; result: OpResult }
  /** A change the player did not ask for (a combat grant), applied like a result's, by `rev`. */
  | { type: "change"; change: ChangeNotice }
  /** After `social` has been updated with it. */
  | { type: "social"; event: SocialEvent }
  /** A direct trade window as it changes: an invite, the offers, confirmations, the end. */
  | { type: "trade"; update: TradeUpdate }
  /** The living world: a view read back, a notice done, a 도감 unlock, an award, a 도움 change. */
  | { type: "live"; push: LivePush };

/** A living-world view, as `read` answers it. */
export type LiveView<K extends LiveReadKind> = Extract<LivePush, { t: K }>;
export type LiveCall<T> = { ok: true; value: T } | { ok: false; code: string; retryMs?: number };

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
  readonly social: SocialState;
  /** Friends in name order with online state, map and level from presence. */
  friends(): FriendStatus[];
  /** Whether the player blocked this character: hide their bubbles and emotes. */
  isBlocked(characterId: string): boolean;
  /**
   * One social request (`SocialRequests` in shared social.ts lists each with its answer).
   * `club.create` takes an operation id: `newOpId()`, and the same id again to retry after
   * `offline` or `timeout`, which never founds or charges twice.
   */
  request<K extends RequestType>(type: K, req: Requests[K]["req"]): Promise<RequestResult<K>>;
  /**
   * One item or currency operation. `id` defaults to a fresh UUID; pass the earlier id to retry.
   * The result's `change` holds the new values to apply over the inventory snapshot.
   */
  op<K extends OpName>(op: K, req: OpRequests[K], id?: string): Promise<OpCall>;
  /** One living-world view (`live.read`): the Page, the board, the 도감, the 연구노트, the rules. */
  read<K extends LiveReadKind>(what: K): Promise<LiveCall<LiveView<K>>>;
  /**
   * A 도움 notice: post one, take one, or take yours down. Resolves once the server sends the
   * notice's new state, or with the refusal.
   */
  help(
    action: "post" | "take" | "cancel",
    body: { template?: HelpTemplate; quest?: string; notice?: string },
  ): Promise<LiveCall<null>>;
  close(): Promise<void>;
}

/** A fresh operation id for `club.create`. */
export function newOpId(): string {
  return crypto.randomUUID();
}

const emptySocial = (): SocialState => ({
  friends: new Map(),
  requests: { in: [], out: [] },
  blocks: new Map(),
  party: null,
  partyInvites: [],
  club: null,
  clubInvites: [],
  applications: [],
  applicants: [],
});

/**
 * What the server would drop the connection for, or refuse for sure, answered here instead:
 * names that break the name rule, and text that cannot pass the length rules.
 */
function precheck(type: SocialType, req: Record<string, unknown>): SendCode | null {
  const name = req.name;
  if (type === "party.invite" && !isPlayerName(name)) return "target_offline";
  if (
    (type === "friend.request" || type === "club.invite" || (type === "block.add" && !req.id)) &&
    !isPlayerName(name)
  ) {
    return "no_player";
  }
  const text = (raw: unknown, max: number) => {
    const cleaned = cleanText(String(raw ?? ""), max);
    return cleaned.ok ? null : cleaned.code;
  };
  if (type === "board.post" || type === "board.pin") return text(req.text, BOARD_POST_LENGTH);
  if (type === "club.notice") return text(req.text, CLUB_NOTICE_LENGTH);
  if (type === "report" && req.note !== undefined) {
    const code = text(req.note, REPORT_NOTE_LENGTH);
    if (code === "too_long") return code;
  }
  if (type === "club.create") {
    if (typeof req.op !== "string" || !SOCIAL_OP_ID.test(req.op)) return "op_id_reused";
    if (String(req.name ?? "").length > 64) return "name_invalid";
  }
  if (type === "club.disband" && String(req.name ?? "").length > 64) return "name_mismatch";
  return null;
}

/** How long `send` waits for the server before answering `timeout`. */
const SEND_TIMEOUT_MS = 8000;
const FIRST_RETRY_MS = 1000;
/** Line ids remembered to drop the repeats the server replays after a reconnect. */
const SEEN_LINES = 256;
/** Operation ids remembered for the same reason. */
const SEEN_RESULTS = 64;
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
  const requests = new Map<
    number,
    {
      resolve: (r: RequestResult<RequestType>) => void;
      timer: ReturnType<typeof setTimeout> | undefined;
    }
  >();
  const social = emptySocial();
  const ops = new Map<
    string,
    { op: OpName; resolve: (r: OpCall) => void; timer: ReturnType<typeof setTimeout> | undefined }
  >();
  const results = new ResultLog(SEEN_RESULTS);
  /** Living-world reads and 도움 requests waiting, by counter. */
  const reads = new Map<
    number,
    {
      resolve: (r: LiveCall<unknown>) => void;
      timer: ReturnType<typeof setTimeout> | undefined;
      help: boolean;
    }
  >();
  const settleRead = (n: number, r: LiveCall<unknown>) => {
    const p = reads.get(n);
    if (!p) return;
    reads.delete(n);
    clearTimeout(p.timer);
    p.resolve(r);
  };
  const armRead = (n: number) =>
    setTimeout(() => settleRead(n, { ok: false, code: "timeout" }), SEND_TIMEOUT_MS);
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
  const armOp = (id: string) =>
    setTimeout(() => {
      const p = ops.get(id);
      if (p) settleOp(id, { id, op: p.op, ok: false, error: "timeout" });
    }, SEND_TIMEOUT_MS);
  const settleOp = (id: string, result: OpCall) => {
    const p = ops.get(id);
    if (!p) return;
    ops.delete(id);
    clearTimeout(p.timer);
    p.resolve(result);
  };
  const settle = (n: number, result: SendResult) => {
    const p = pending.get(n);
    if (!p) return;
    pending.delete(n);
    clearTimeout(p.timer);
    p.resolve(result);
  };
  const armRequest = (n: number) =>
    setTimeout(() => settleRequest(n, { ok: false, code: "timeout" }), SEND_TIMEOUT_MS);
  const settleRequest = (n: number, result: RequestResult<RequestType>) => {
    const p = requests.get(n);
    if (!p) return;
    requests.delete(n);
    clearTimeout(p.timer);
    p.resolve(result);
  };

  function onSocial(e: SocialEvent): void {
    switch (e.t) {
      case "all": {
        const s: SocialSnapshot = e.s;
        social.friends = new Map(s.friends.map((f) => [f.id, f]));
        social.requests = s.requests;
        social.blocks = new Map(s.blocks.map((b) => [b.id, b]));
        social.party = s.party;
        social.partyInvites = s.partyInvites;
        social.club = s.club;
        social.clubInvites = s.clubInvites;
        social.applications = s.applications;
        social.applicants = s.applicants;
        break;
      }
      case "friend":
        social.friends.set(e.f.id, e.f);
        break;
      case "unfriend":
        social.friends.delete(e.id);
        break;
      case "requests":
        social.requests = { in: e.in, out: e.out };
        break;
      case "blocks":
        social.blocks = new Map(e.list.map((b) => [b.id, b]));
        break;
      case "party":
        social.party = e.party;
        break;
      case "partyInvites":
        social.partyInvites = e.list;
        break;
      case "vitals":
        for (let i = 0; i + 2 < e.v.length; i += 3) {
          const member = social.party?.members[e.v[i] as number];
          const mode = CONTROL_MODES[e.v[i + 2] as number] ?? "";
          if (member) Object.assign(member, { hp: e.v[i + 1], mode });
        }
        break;
      case "club":
        social.club = e.club;
        break;
      case "clubExp":
        if (social.club) Object.assign(social.club, { level: e.level, exp: e.exp });
        break;
      case "clubInvites":
        social.clubInvites = e.list;
        break;
      case "applications":
        social.applications = e.list;
        break;
      case "applicants":
        social.applicants = e.list;
        break;
      case "emote":
        break;
    }
    emit({ type: "social", event: e });
  }

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
    joined.onMessage(WORLD_MESSAGES.result, (result: OpResult) => {
      if (results.admit(result)) emit({ type: "result", result });
      settleOp(result.id, result);
    });
    joined.onMessage(WORLD_MESSAGES.change, (change: ChangeNotice) => {
      emit({ type: "change", change });
    });
    joined.onMessage(WORLD_MESSAGES.social, onSocial);
    joined.onMessage(WORLD_MESSAGES.trade, (update: TradeUpdate) =>
      emit({ type: "trade", update }),
    );
    joined.onMessage(LIVE_MESSAGES.push, (push: LivePush) => {
      if ("n" in push && push.n !== undefined) settleRead(push.n, { ok: true, value: push });
      // A 도움 notice's new state answers the oldest 도움 request still waiting.
      if (push.t === "help") {
        const first = [...reads].find(([, p]) => p.help);
        if (first) settleRead(first[0], { ok: true, value: null });
      }
      emit({ type: "live", push });
    });
    joined.onMessage(WORLD_MESSAGES.done, (d: Done) => {
      settleRequest(d.n, { ok: true, data: d.data as Requests[RequestType]["done"] });
    });
    joined.onMessage(WORLD_MESSAGES.refused, (r: Refusal) => {
      if (r.n === undefined) return;
      if (reads.has(r.n)) {
        settleRead(r.n, {
          ok: false,
          code: r.code,
          ...(r.retryMs === undefined ? {} : { retryMs: r.retryMs }),
        });
        return;
      }
      const { code, until, retryMs, need } = r;
      if (r.type !== WORLD_MESSAGES.chat) {
        settleRequest(r.n, {
          ok: false,
          code,
          ...(retryMs === undefined ? {} : { retryMs }),
          ...(need === undefined ? {} : { need }),
        });
        return;
      }
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
      for (const p of requests.values()) clearTimeout(p.timer);
      for (const p of ops.values()) clearTimeout(p.timer);
      for (const p of reads.values()) clearTimeout(p.timer);
      setStatus("reconnecting");
    });
    joined.onReconnect(() => {
      for (const [n, p] of pending) p.timer = arm(n);
      for (const [n, p] of requests) p.timer = armRequest(n);
      for (const [id, p] of ops) p.timer = armOp(id);
      for (const [n, p] of reads) p.timer = armRead(n);
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
      for (const n of [...requests.keys()]) settleRequest(n, { ok: false, code: "offline" });
      for (const [id, p] of [...ops]) settleOp(id, { id, op: p.op, ok: false, error: "offline" });
      for (const n of [...reads.keys()]) settleRead(n, { ok: false, code: "offline" });
      const end = closeEnd(code);
      if (end) {
        setStatus(end);
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
    social,
    friends() {
      return [...social.friends.values()]
        .map((f) => {
          const p = presence.get(f.id);
          return { ...f, online: p !== undefined, map: p?.map ?? "", level: p?.level ?? f.level };
        })
        .sort((a, b) => a.name.localeCompare(b.name, "ko"));
    },
    isBlocked(characterId) {
      return social.blocks.has(characterId);
    },
    request(type, req) {
      type R = RequestResult<typeof type>;
      const local = isSocialType(type) ? precheck(type, req as Record<string, unknown>) : null;
      if (local) return Promise.resolve({ ok: false, code: local } as R);
      const open = room;
      if (!open || status !== "online") return Promise.resolve({ ok: false, code: "offline" } as R);
      const n = ++counter;
      return new Promise<R>((resolve) => {
        requests.set(n, {
          resolve: resolve as (r: RequestResult<RequestType>) => void,
          timer: armRequest(n),
        });
        const body = Object.fromEntries(Object.entries(req).filter(([, v]) => v !== undefined));
        open.send(type, { ...body, n });
      });
    },
    op(name, req, id = crypto.randomUUID()) {
      const open = room;
      if (!open || status !== "online") {
        return Promise.resolve({ id, op: name, ok: false, error: "offline" });
      }
      // A second call with an id still waiting shares the first call's answer.
      const waiting = ops.get(id);
      if (waiting) {
        return new Promise<OpCall>((resolve) => {
          const first = waiting.resolve;
          waiting.resolve = (r) => {
            first(r);
            resolve(r);
          };
        });
      }
      return new Promise<OpCall>((resolve) => {
        ops.set(id, { op: name, resolve, timer: armOp(id) });
        open.send(name, { id, req });
      });
    },
    read(what) {
      type R = LiveCall<LiveView<typeof what>>;
      const open = room;
      if (!open || status !== "online") return Promise.resolve({ ok: false, code: "offline" } as R);
      const n = ++counter;
      return new Promise<R>((resolve) => {
        reads.set(n, {
          resolve: resolve as (r: LiveCall<unknown>) => void,
          timer: armRead(n),
          help: false,
        });
        open.send(LIVE_MESSAGES.read, { what, n });
      });
    },
    help(action, body) {
      const open = room;
      if (!open || status !== "online") {
        return Promise.resolve({ ok: false, code: "offline" } as LiveCall<null>);
      }
      const n = ++counter;
      const type =
        action === "post"
          ? LIVE_MESSAGES.helpPost
          : action === "take"
            ? LIVE_MESSAGES.helpTake
            : LIVE_MESSAGES.helpCancel;
      const message =
        action === "post"
          ? { template: body.template, ...(body.quest ? { quest: body.quest } : {}), n }
          : { notice: body.notice, n };
      return new Promise<LiveCall<null>>((resolve) => {
        reads.set(n, {
          resolve: resolve as (r: LiveCall<unknown>) => void,
          timer: armRead(n),
          help: true,
        });
        open.send(type, message);
      });
    },
    async close() {
      stopped = true;
      await room?.leave();
      setStatus("closed");
    },
  };
}
