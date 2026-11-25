/**
 * The WorldRoom (PLAN §12, §19): one per process, held by every client for the whole session
 * beside its map room. Presence and chat for now; parties, clubs and trades join it later.
 * Presence goes out as small events, never as synced state, so an idle room sends nothing.
 */
import { type AuthContext, type Client, CloseCode, Room, ServerError } from "@colyseus/core";
import {
  CHAT_BURST,
  CHAT_PER_SECOND,
  type Character,
  type ChatLine,
  type ChatSend,
  chatSendSchema,
  cleanChatText,
  FILTER_MUTE_MS,
  FILTER_REPEAT_MS,
  NEAR_CHAT_TILES,
  OPS,
  type OpMessage,
  type OpResult,
  opSchema,
  type PresenceEntry,
  type PresenceMessage,
  RECONNECT_SECONDS,
  type Refusal,
  type SystemLine,
  TILE_SIZE,
  WORLD_CHAT_LEVEL,
  WORLD_MESSAGES,
  type WorldMessageSchema,
} from "@guago/shared";
import { ChatFilter } from "./chat/filter.ts";
import type { ChatLogRow, ChatSink } from "./chat/log.ts";
import type { OpHandler } from "./economy/handler.ts";
import { places } from "./places.ts";
import { authenticateJoin, RoomSeats } from "./seats.ts";

/** Past this many handled messages a second, a client is flooding and is dropped for good. */
const FLOOD_PER_SECOND = 20;
/**
 * Colyseus's own frame limit, a backstop for frames no handler sees (requests, bytes, pings).
 * Its drop cannot be told from an ordinary one, so the seat may come back; the frames do
 * nothing, and each round costs the sender a reconnect.
 */
const FRAMES_PER_SECOND = 40;
/** Answers (own echoes and refusals) kept per member, replayed after a reconnect. */
const KEPT_ANSWERS = 8;

/** Per-type limits for requests a player may simply send too fast (PLAN §21). */
const LIMITS = {
  [WORLD_MESSAGES.chat]: { burst: CHAT_BURST, perSecond: CHAT_PER_SECOND },
} as const;
type Limited = keyof typeof LIMITS;

const NEAR_RADIUS = NEAR_CHAT_TILES * TILE_SIZE;

interface Member {
  client: Client;
  characterId: string;
  entry: PresenceEntry;
  /** The last answers to this member's own requests, for replay after a reconnect. */
  answers: { type: string; body: ChatLine | Refusal | OpResult }[];
}

/** Filter strikes and buckets, by character: they outlive a reconnect or a second login. */
interface Standing {
  lastHit: number;
  mutedUntil: number;
  buckets: Partial<Record<Limited, { tokens: number; at: number }>>;
  touched: number;
}

interface Services {
  filter: ChatFilter;
  log: ChatSink | undefined;
  /** Item and currency operations; without it the room does not take them (tests). */
  ops: OpHandler | undefined;
}

let services: Services | undefined;
let current: WorldRoom | undefined;

/** Called once at server start. Without a sink, chat is not logged (tests). */
export function provideWorldServices(s: {
  filter?: ChatFilter;
  log?: ChatSink;
  ops?: OpHandler;
}): void {
  services = { filter: s.filter ?? ChatFilter.fromFile(), log: s.log, ops: s.ops };
}

function use(): Services {
  services ??= { filter: ChatFilter.fromFile(), log: undefined, ops: undefined };
  return services;
}

/** The process's WorldRoom, for other rooms that send system lines or level changes. */
export function worldRoom(): WorldRoom | undefined {
  return current;
}

export class WorldRoom extends Room {
  override maxMessagesPerSecond = FRAMES_PER_SECOND;
  override autoDispose = false;

  private seats = new RoomSeats("", () => undefined, "world");
  private members = new Map<string, Member>();
  private byCharacter = new Map<string, Member>();
  private byName = new Map<string, Member>();
  private standing = new Map<string, Standing>();
  private lineId = 0;
  private unlisten: (() => void) | undefined;
  /** Sessions dropped for a malformed message or for flooding: they get no seat back. */
  private kicked = new Set<string>();
  private flood = new Map<string, { count: number; resetAt: number }>();

  static override async onAuth(_token: string, _options: unknown, ctx: AuthContext) {
    return authenticateJoin(ctx);
  }

  override onCreate(): void {
    // One per process: the server makes it at start, and nothing may make a second.
    if (current) throw new ServerError(409, "world room exists");
    current = this;
    this.handle(WORLD_MESSAGES.chat, chatSendSchema, (client, message) =>
      this.chat(client, message),
    );
    // Item and currency operations (PLAN §21): one message type per operation, `{ id, req }`,
    // each answered by exactly one `result` with its id. The handler limits each type.
    const ops = use().ops;
    if (ops) {
      for (const op of OPS) {
        this.handle(op, opSchema(op), (client, message) => void this.operate(ops, client, message));
      }
    }
    this.unlisten = places.listen((characterId, mapId) => {
      const member = this.byCharacter.get(characterId);
      if (!member || member.entry.map === mapId) return;
      member.entry.map = mapId;
      this.broadcast(WORLD_MESSAGES.presence, {
        t: "map",
        id: characterId,
        map: mapId,
      } satisfies PresenceMessage);
    });
    this.clock.setInterval(() => this.forget(), 60_000);
  }

  override async onJoin(client: Client): Promise<void> {
    const character: Character = await this.seats.join(client);
    const entry: PresenceEntry = {
      id: character.id,
      name: character.name,
      major: character.major,
      level: character.level,
      map: places.get(character.id)?.mapId ?? "",
    };
    const member: Member = { client, characterId: character.id, entry, answers: [] };
    this.members.set(client.sessionId, member);
    this.byCharacter.set(character.id, member);
    this.byName.set(character.name.toLowerCase(), member);
    this.sendAll(member);
    this.broadcast(WORLD_MESSAGES.presence, { t: "join", p: entry } satisfies PresenceMessage, {
      except: client,
    });
  }

  // The close code cannot tell a kick from an ordinary drop: Colyseus closes a stale socket with
  // the same error code when its owner reconnects first. So kicks are remembered by session.
  override onDrop(client: Client): void {
    if (this.kicked.has(client.sessionId) || !this.seats.mayReconnect(client)) return;
    this.seats.hold(client, this.allowReconnection(client, RECONNECT_SECONDS));
  }

  /**
   * Nothing sent while the socket was down arrived: the presence list is sent whole again, and
   * the answers to the member's own last requests are replayed (the client drops repeats by id).
   */
  override onReconnect(client: Client): void {
    this.seats.reconnected(client);
    const member = this.members.get(client.sessionId);
    if (!member) return;
    member.client = client;
    this.sendAll(member);
    for (const { type, body } of member.answers) client.send(type, body);
  }

  /** A message type with no handler is garbage: drop the sender for good. */
  override onUnhandledMessage(client: Client): void {
    this.kick(client);
  }

  override async onLeave(client: Client): Promise<void> {
    const member = this.members.get(client.sessionId);
    if (member) {
      this.members.delete(client.sessionId);
      // A newer seat of the same character may already be in (after the eviction wait ran out).
      if (this.byCharacter.get(member.characterId) === member) {
        this.byCharacter.delete(member.characterId);
        this.byName.delete(member.entry.name.toLowerCase());
        this.broadcast(WORLD_MESSAGES.presence, {
          t: "leave",
          id: member.characterId,
        } satisfies PresenceMessage);
      }
    }
    this.kicked.delete(client.sessionId);
    this.flood.delete(client.sessionId);
    await this.seats.leave(client);
  }

  override async onDispose(): Promise<void> {
    if (current === this) current = undefined;
    this.unlisten?.();
    await use().log?.flush();
  }

  /** A server line to everyone, or to one character when it is online. */
  system(line: Omit<SystemLine, "id" | "at">, toCharacterId?: string): void {
    const sent: SystemLine = { ...line, id: ++this.lineId, at: Date.now() };
    if (toCharacterId === undefined) this.broadcast(WORLD_MESSAGES.system, sent);
    else this.byCharacter.get(toCharacterId)?.client.send(WORLD_MESSAGES.system, sent);
    this.log({
      channel: "system",
      senderId: null,
      target: toCharacterId ?? null,
      body: line.text ?? JSON.stringify({ key: line.key, params: line.params }),
      masked: false,
      at: new Date(sent.at),
    });
  }

  /** Called when a character's level changes, for presence and the 전체 level gate. */
  setLevel(characterId: string, level: number): void {
    const member = this.byCharacter.get(characterId);
    if (!member || member.entry.level === level) return;
    member.entry.level = level;
    this.broadcast(WORLD_MESSAGES.presence, {
      t: "level",
      id: characterId,
      level,
    } satisfies PresenceMessage);
  }

  // Messages ---------------------------------------------------------------------------------

  /**
   * Registers a handler behind its schema (PLAN §21) and the flood limit. A message that fails
   * the schema, or a client past the flood limit, is kicked; sending too fast for a type's own
   * limit is only refused, by the handler.
   */
  private handle<T>(
    type: string,
    schema: WorldMessageSchema<T>,
    handler: (client: Client, message: T) => void,
  ): void {
    this.onMessage(type, (client: Client, raw: unknown) => {
      if (this.kicked.has(client.sessionId)) return;
      const now = Date.now();
      const flood = this.flood.get(client.sessionId) ?? { count: 0, resetAt: now + 1000 };
      if (now >= flood.resetAt) Object.assign(flood, { count: 0, resetAt: now + 1000 });
      flood.count++;
      this.flood.set(client.sessionId, flood);
      if (flood.count > FLOOD_PER_SECOND) return this.kick(client);
      const result = schema["~standard"].validate(raw);
      if (result.issues !== undefined) return this.kick(client);
      handler(client, result.value);
    });
  }

  private kick(client: Client): void {
    this.kicked.add(client.sessionId);
    client.leave(CloseCode.WITH_ERROR);
  }

  private sendAll(member: Member): void {
    member.client.send(WORLD_MESSAGES.presence, {
      t: "all",
      you: member.characterId,
      list: [...this.members.values()].map((m) => m.entry),
    } satisfies PresenceMessage);
  }

  /** Sends an answer to the member's own request and keeps it for replay. */
  private answer(member: Member, type: string, body: ChatLine | Refusal | OpResult): void {
    member.answers.push({ type, body });
    if (member.answers.length > KEPT_ANSWERS) member.answers.shift();
    member.client.send(type, body);
  }

  /**
   * The level the 전체 gate reads: the joined level, kept current by `setLevel`, which the item
   * executor calls after every commit that changes a character's level.
   */
  private levelOf(member: Member): number {
    return member.entry.level;
  }

  // Item and currency operations -------------------------------------------------------------

  private async operate(ops: OpHandler, client: Client, message: OpMessage): Promise<void> {
    const me = this.members.get(client.sessionId);
    if (!me) return;
    const result = await ops.run(me.characterId, message);
    // The member may have reconnected meanwhile; `answer` sends to its current socket and keeps
    // the result for replay, so a result lost to a drop arrives after the reconnect.
    if (this.members.get(client.sessionId) === me) this.answer(me, WORLD_MESSAGES.result, result);
  }

  // Chat -------------------------------------------------------------------------------------

  private chat(client: Client, message: ChatSend): void {
    const me = this.members.get(client.sessionId);
    if (!me) return;
    const refusal = this.speak(me, message);
    if (refusal) {
      this.answer(me, WORLD_MESSAGES.refused, {
        type: WORLD_MESSAGES.chat,
        n: message.n,
        ...refusal,
      } satisfies Refusal);
    }
  }

  /** Delivers and logs one line, or says why not. */
  private speak(me: Member, message: ChatSend): Omit<Refusal, "type" | "n"> | undefined {
    const cleaned = cleanChatText(message.text);
    if (!cleaned.ok) return { code: cleaned.code };
    const now = Date.now();
    const standing = this.standingOf(me.characterId, now);
    if (standing.mutedUntil > now) return { code: "muted", until: standing.mutedUntil };

    let recipients: Member[];
    let target: string | null = null;
    let to: ChatLine["to"];
    let sid: string | undefined;
    switch (message.ch) {
      case "world":
        if (this.levelOf(me) < WORLD_CHAT_LEVEL) {
          return { code: "level", need: WORLD_CHAT_LEVEL };
        }
        recipients = [...this.members.values()];
        break;
      case "near": {
        const place = places.get(me.characterId);
        if (!place) return { code: "no_map" };
        sid = place.sessionId;
        target = place.mapId;
        recipients = places
          .near(me.characterId, NEAR_RADIUS)
          .flatMap(({ characterId }) => this.byCharacter.get(characterId) ?? []);
        break;
      }
      case "whisper": {
        const other = this.byName.get((message.to ?? "").toLowerCase());
        if (!other) return { code: "target_offline" };
        if (other === me) return { code: "target_self" };
        target = other.characterId;
        to = { id: other.characterId, name: other.entry.name };
        recipients = [me, other];
        break;
      }
      default:
        return { code: "no_channel" };
    }

    const retryMs = this.take(standing, WORLD_MESSAGES.chat, now);
    if (retryMs > 0) return { code: "rate_limited", retryMs };

    const filtered = use().filter.check(cleaned.text);
    if (filtered.unreadable) return { code: "unreadable" };
    if (filtered.masked) {
      // A second hit within the window mutes; the masked line itself still goes out.
      if (now - standing.lastHit <= FILTER_REPEAT_MS) {
        standing.mutedUntil = now + FILTER_MUTE_MS;
      }
      standing.lastHit = now;
    }

    const line: ChatLine = {
      id: ++this.lineId,
      ch: message.ch,
      from: { id: me.characterId, name: me.entry.name, ...(sid ? { sid } : {}) },
      ...(to ? { to } : {}),
      text: filtered.text,
      at: now,
    };
    for (const member of recipients) {
      if (member === me) this.answer(me, WORLD_MESSAGES.chat, { ...line, n: message.n });
      else member.client.send(WORLD_MESSAGES.chat, line);
    }
    this.log({
      channel: message.ch,
      senderId: me.characterId,
      target,
      body: cleaned.text,
      masked: filtered.masked,
      at: new Date(now),
    });
    if (standing.mutedUntil > now) {
      this.system({ key: "muted", params: { until: standing.mutedUntil } }, me.characterId);
    }
    return undefined;
  }

  private log(row: ChatLogRow): void {
    use().log?.push(row);
  }

  private standingOf(characterId: string, now: number): Standing {
    let s = this.standing.get(characterId);
    if (!s) {
      s = { lastHit: -Infinity, mutedUntil: 0, buckets: {}, touched: now };
      this.standing.set(characterId, s);
    }
    s.touched = now;
    return s;
  }

  /** Token bucket per type: 0 when the request may go ahead, else ms until it may. */
  private take(standing: Standing, type: Limited, now: number): number {
    const { burst, perSecond } = LIMITS[type];
    standing.buckets[type] ??= { tokens: burst, at: now };
    const bucket = standing.buckets[type];
    bucket.tokens = Math.min(burst, bucket.tokens + ((now - bucket.at) / 1000) * perSecond);
    bucket.at = now;
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return 0;
    }
    return Math.ceil(((1 - bucket.tokens) / perSecond) * 1000);
  }

  /** Drops standings with nothing left to remember. */
  private forget(): void {
    const now = Date.now();
    for (const [id, s] of this.standing) {
      const quiet = now - s.touched > FILTER_REPEAT_MS && s.mutedUntil < now;
      if (quiet && !this.byCharacter.has(id)) this.standing.delete(id);
    }
  }
}
