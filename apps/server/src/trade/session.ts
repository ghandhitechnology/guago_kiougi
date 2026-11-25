/**
 * Direct trades between two players standing together (PLAN §13 "Player trading"), independent
 * of the transport: the WorldRoom hands each `trade.*` message here and sends what comes back.
 *
 * A trade window is memory only. Nothing leaves a bag until both sides confirm the same version
 * of both offers; then one `trade.commit` operation moves everything in one transaction, checking
 * every item, stack and 솔방울 again under the locks. Any change to either offer bumps the
 * version and clears both confirmations, so the commit carries exactly what both confirmed.
 * Walking apart, changing map, leaving, a new login and the clock all close a window; since
 * nothing was held, closing has nothing to give back.
 *
 * Messages of one window run one at a time, in arrival order, so a confirm and an offer change
 * can never interleave: whichever the window takes second sees the first.
 */
import { randomUUID } from "node:crypto";
import {
  type OpError,
  TILE_SIZE,
  TRADABLE_STACK,
  TRADE,
  TRADE_MESSAGES,
  TRADE_RATE,
  type TradeCloseReason,
  type TradeMessage,
  type TradeOffer,
  type TradeOfferView,
  type TradeRefusalCode,
  type TradeUpdate,
} from "@guago/shared";
import { sql } from "drizzle-orm";
import { type Db, describeError } from "../db/index.ts";
import { Buckets } from "../economy/buckets.ts";
import { type Executor, isTransient } from "../economy/executor.ts";
import { ITEM_COLUMNS, type ItemRow, itemFromDb, itemView } from "../economy/rows.ts";
import {
  type CommitOffer,
  type ItemPrint,
  printOf,
  type TradeCommitRequest,
  untradable,
} from "./ops.ts";

const RANGE_PX = TRADE.rangeTiles * TILE_SIZE;
const CHECK_EVERY_MS = 1000;
/** A commit whose answer was lost is retried under its same id, which applies it at most once. */
const COMMIT_RETRIES_MS = [200, 1000, 3000];

/** What the trade windows need from the world around them. */
export interface TradeLink {
  /** Online in the WorldRoom: name and the level it tracks. */
  member(characterId: string): { name: string; level: number } | undefined;
  /** Where the character stands, from the map rooms (`places`). */
  place(characterId: string): { roomId: string; x: number; y: number } | undefined;
  send(characterId: string, update: TradeUpdate): void;
}

/**
 * Whether `a` blocked `b`. Block lists arrive with the social systems (`feat/social-server`);
 * until then nobody has blocked anyone. A request either way between a blocked pair is dropped
 * without a word to either side: the asker sees it lapse like an unanswered one.
 */
export type IsBlocked = (a: string, b: string) => boolean;
export const nobodyBlocked: IsBlocked = () => false;

interface Side {
  offer: TradeOffer;
  view: TradeOfferView;
  prints: ItemPrint[];
}

interface Window {
  id: string;
  from: string;
  to: string;
  state: "invited" | "open" | "committing" | "closed";
  /** A request a block dropped: only the asker knows of it. */
  ghost: boolean;
  version: number;
  sides: Map<string, Side>;
  confirmed: Set<string>;
  expiresAt: number;
  /** Set when a side left while the commit was in flight: the window closes after it. */
  closing?: TradeCloseReason;
  queue: Promise<unknown>;
}

/** One answer per request: `done` with the window's id, or `refused` with a code. */
export type TradeAnswer =
  | { ok: true; session: string }
  | { ok: false; code: TradeRefusalCode; retryMs?: number };

const EMPTY: TradeOffer = { items: [], stacks: {}, pinecone: "0" };
const emptySide = (): Side => ({
  offer: EMPTY,
  view: { items: [], stacks: {}, pinecone: "0" },
  prints: [],
});

export interface TradeOptions {
  db: Db;
  executor: Pick<Executor, "executeAll">;
  link: TradeLink;
  isBlocked?: IsBlocked;
  /** Real time, for the window's own timers: a request's 30 seconds, a window's 5 minutes. */
  now?: () => number;
  /** The server clock (live/clock.ts), for the rules: an item's re-trade cooldown. */
  clock?: () => Date;
}

export function createTrades({
  db,
  executor,
  link,
  isBlocked = nobodyBlocked,
  now = Date.now,
  clock = () => new Date(now()),
}: TradeOptions) {
  const windows = new Map<string, Window>();
  const byCharacter = new Map<string, Window>();
  const buckets = new Buckets();

  const other = (w: Window, me: string) => (w.from === me ? w.to : w.from);
  const party = (w: Window, me: string) => w.from === me || w.to === me;

  /** Runs `work` after every earlier message of the window. */
  function serial<T>(w: Window, work: () => Promise<T>): Promise<T> {
    const next = w.queue.then(work, work);
    w.queue = next.catch(() => {});
    return next;
  }

  function push(w: Window, update: TradeUpdate, only?: string): void {
    for (const id of [w.from, w.to]) {
      if (only !== undefined && id !== only) continue;
      if (w.ghost && id !== w.from) continue;
      link.send(id, update);
    }
  }

  function close(w: Window, reason: TradeCloseReason): void {
    if (w.state === "closed") return;
    if (w.state === "committing") {
      w.closing ??= reason;
      return;
    }
    w.state = "closed";
    windows.delete(w.id);
    for (const id of [w.from, w.to]) if (byCharacter.get(id) === w) byCharacter.delete(id);
    push(w, { t: "closed", session: w.id, reason });
  }

  /** Why two characters cannot trade where they stand, or null. */
  function apart(a: string, b: string): TradeRefusalCode | null {
    const pa = link.place(a);
    const pb = link.place(b);
    if (!pa || !pb || pa.roomId !== pb.roomId) return "trade_far";
    return Math.hypot(pa.x - pb.x, pa.y - pb.y) <= RANGE_PX ? null : "trade_far";
  }

  function offersView(w: Window): Record<string, TradeOfferView> {
    return Object.fromEntries(
      [w.from, w.to].map((id) => [id, (w.sides.get(id) ?? emptySide()).view]),
    );
  }

  /**
   * One side's offer read against its owner's rows as they stand. Not locked: the commit checks
   * it all again under the locks. Returns the side, or why it cannot be offered.
   */
  async function read(owner: string, offer: TradeOffer): Promise<Side | OpError> {
    const at = clock();
    let rows: ItemRow[] = [];
    if (offer.items.length > 0) {
      const found = await db.execute(sql`
        select ${sql.raw(ITEM_COLUMNS)} from items
        where owner_id = ${owner} and listing_id is null
          and id = any(${sql.param(offer.items)}::uuid[])`);
      rows = found.rows.map(itemFromDb);
      if (rows.length !== offer.items.length) return "trade_item_gone";
      for (const row of rows) {
        const why = untradable(row, at);
        if (why) return why;
      }
    }
    const stacks = Object.keys(offer.stacks);
    if (stacks.some((s) => !TRADABLE_STACK.test(s))) return "trade_stack";
    const held = await db.execute(sql`
      select coalesce((select pinecones::text from wallets where character_id = ${owner}), '0') as pinecone,
        coalesce((select json_object_agg(def_id, qty::text) from materials
          where character_id = ${owner} and def_id = any(${sql.param(stacks)}::text[])), '{}'::json) as stacks`);
    const h = held.rows[0] as { pinecone: string; stacks: Record<string, string> };
    if (BigInt(h.pinecone) < BigInt(offer.pinecone)) return "trade_funds";
    for (const [def, qty] of Object.entries(offer.stacks)) {
      if (BigInt(h.stacks[def] ?? "0") < BigInt(qty)) return "trade_funds";
    }
    const order = new Map(offer.items.map((id, i) => [id, i]));
    rows.sort((x, y) => (order.get(x.id) ?? 0) - (order.get(y.id) ?? 0));
    return {
      offer,
      view: { items: rows.map(itemView), stacks: offer.stacks, pinecone: offer.pinecone },
      prints: rows.map(printOf),
    };
  }

  /** After a refused commit: each side as it now stands, minus what can no longer be offered. */
  async function refresh(w: Window): Promise<void> {
    for (const id of [w.from, w.to]) {
      const side = w.sides.get(id) ?? emptySide();
      const fresh = await read(id, side.offer);
      if (typeof fresh !== "string") {
        w.sides.set(id, fresh);
        continue;
      }
      // Keep what still reads; drop the rest.
      const items: string[] = [];
      for (const item of side.offer.items) {
        const one = await read(id, { items: [item], stacks: {}, pinecone: "0" });
        if (typeof one !== "string") items.push(item);
      }
      const stacks: Record<string, number> = {};
      for (const [def, qty] of Object.entries(side.offer.stacks)) {
        const one = await read(id, { items: [], stacks: { [def]: qty }, pinecone: "0" });
        if (typeof one !== "string") stacks[def] = qty;
      }
      const coin = await read(id, { items: [], stacks: {}, pinecone: side.offer.pinecone });
      const kept = await read(id, {
        items,
        stacks,
        pinecone: typeof coin === "string" ? "0" : side.offer.pinecone,
      });
      w.sides.set(id, typeof kept === "string" ? emptySide() : kept);
    }
  }

  function limited(me: string, kind: "request" | "window"): number {
    return buckets.take(`${me}\u0000${kind}`, TRADE_RATE[kind], now());
  }

  const reply = (session: string): TradeAnswer => ({ ok: true, session });
  const fail = (code: TradeRefusalCode, retryMs?: number): TradeAnswer => ({
    ok: false,
    code,
    ...(retryMs ? { retryMs } : {}),
  });

  function windowOf(me: string, session: string): Window | undefined {
    const w = windows.get(session);
    return w && party(w, me) && !(w.ghost && me !== w.from) ? w : undefined;
  }

  async function request(me: string, to: string): Promise<TradeAnswer> {
    const wait = limited(me, "request");
    if (wait > 0) return fail("rate_limited", wait);
    if (to === me) return fail("trade_self");
    const mine = link.member(me);
    const theirs = link.member(to);
    if (!mine || !theirs) return fail("trade_offline");
    if (mine.level < TRADE.level || theirs.level < TRADE.level) return fail("trade_level");
    if (byCharacter.has(me)) return fail("trade_busy");
    const far = apart(me, to);
    if (far) return fail(far);
    const ghost = isBlocked(to, me) || isBlocked(me, to);
    if (!ghost && byCharacter.has(to)) return fail("trade_busy");
    const w: Window = {
      id: randomUUID(),
      from: me,
      to,
      state: "invited",
      ghost,
      version: 0,
      sides: new Map(),
      confirmed: new Set(),
      expiresAt: now() + TRADE.inviteSeconds * 1000,
      queue: Promise.resolve(),
    };
    windows.set(w.id, w);
    byCharacter.set(me, w);
    if (!ghost) {
      byCharacter.set(to, w);
      link.send(to, {
        t: "invite",
        session: w.id,
        from: { id: me, name: mine.name },
        expiresAt: w.expiresAt,
      });
    }
    return reply(w.id);
  }

  function accept(me: string, w: Window): TradeAnswer {
    if (w.to !== me || w.state !== "invited") return fail("trade_no_session");
    const far = apart(w.from, w.to);
    if (far) {
      close(w, "far");
      return fail(far);
    }
    w.state = "open";
    w.expiresAt = now() + TRADE.sessionSeconds * 1000;
    w.sides.set(w.from, emptySide());
    w.sides.set(w.to, emptySide());
    for (const id of [w.from, w.to]) {
      const them = other(w, id);
      link.send(id, {
        t: "open",
        session: w.id,
        with: { id: them, name: link.member(them)?.name ?? "" },
        version: w.version,
        offers: offersView(w),
        confirmed: [],
        expiresAt: w.expiresAt,
      });
    }
    return reply(w.id);
  }

  async function offer(me: string, w: Window, next: TradeOffer): Promise<TradeAnswer> {
    if (w.state === "committing") return fail("trade_busy");
    if (w.state !== "open") return fail("trade_no_session");
    const side = await read(me, next);
    if (typeof side === "string") return fail(side as TradeRefusalCode);
    if (w.state !== "open") return fail("trade_no_session");
    w.sides.set(me, side);
    w.version++;
    w.confirmed.clear();
    push(w, { t: "offer", session: w.id, version: w.version, offers: offersView(w) });
    return reply(w.id);
  }

  async function confirm(me: string, w: Window, version: number): Promise<TradeAnswer> {
    if (w.state === "committing") return fail("trade_busy");
    if (w.state !== "open") return fail("trade_no_session");
    if (version !== w.version) return fail("trade_changed");
    const all = [...w.sides.values()];
    const empty = all.every(
      (s) =>
        s.offer.items.length === 0 &&
        Object.keys(s.offer.stacks).length === 0 &&
        s.offer.pinecone === "0",
    );
    if (empty) return fail("trade_empty");
    w.confirmed.add(me);
    push(w, { t: "confirm", session: w.id, version: w.version, confirmed: [...w.confirmed] });
    if (w.confirmed.size === 2) await commit(w, me);
    return reply(w.id);
  }

  /** Both sides confirmed this version: positions once more, then one operation moves it all. */
  async function commit(w: Window, last: string): Promise<void> {
    const far = apart(w.from, w.to);
    if (far) return close(w, "far");
    // A block made while the window was open ends it the way a block ends a request: quietly.
    if (isBlocked(w.from, w.to) || isBlocked(w.to, w.from)) return close(w, "cancelled");
    w.state = "committing";
    const parties = [w.from, w.to].sort() as [string, string];
    const offers: Record<string, CommitOffer> = {};
    for (const id of parties) {
      const side = w.sides.get(id) ?? emptySide();
      offers[id] = { items: side.prints, stacks: side.offer.stacks, pinecone: side.offer.pinecone };
    }
    const request: TradeCommitRequest = { parties, offers };
    const opId = `trade:${w.id}:${w.version}`;
    let results: Awaited<ReturnType<typeof executor.executeAll>> | undefined;
    for (let attempt = 0; results === undefined; attempt++) {
      try {
        results = await executor.executeAll(last, opId, "trade.commit", request);
      } catch (error) {
        const delay = COMMIT_RETRIES_MS[attempt];
        if (!isTransient(error) || delay === undefined) {
          console.error(`trade ${w.id} commit failed: ${describeError(error)}`);
          break;
        }
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    const mine = results?.get(last);
    if (!results || !mine) {
      // The outcome is whatever the database holds; a new version could apply it twice.
      push(w, { t: "failed", session: w.id, version: w.version, error: "server_error" });
      w.state = "open";
      return close(w, w.closing ?? "cancelled");
    }
    if (mine.ok) {
      w.state = "closed";
      windows.delete(w.id);
      for (const id of parties) {
        if (byCharacter.get(id) === w) byCharacter.delete(id);
        const r = results.get(id);
        if (r?.ok)
          link.send(id, {
            t: "done",
            session: w.id,
            change: r.change,
            tax: String(r.outcome.tax ?? "0"),
          });
      }
      return;
    }
    w.state = "open";
    if (w.closing) return close(w, w.closing);
    await refresh(w);
    w.version++;
    w.confirmed.clear();
    push(w, { t: "failed", session: w.id, version: w.version, error: mine.error });
    push(w, { t: "offer", session: w.id, version: w.version, offers: offersView(w) });
  }

  async function handle(me: string, message: TradeMessage): Promise<TradeAnswer> {
    if (message.type === TRADE_MESSAGES.request) return request(me, message.req.to);
    const wait = limited(me, "window");
    if (wait > 0) return fail("rate_limited", wait);
    const w = windowOf(me, message.req.session);
    if (!w) return fail("trade_no_session");
    return serial(w, async () => {
      if (w.state === "closed") return fail("trade_no_session");
      switch (message.type) {
        case "trade.accept":
          return accept(me, w);
        case "trade.decline":
          if (w.to !== me || w.state !== "invited") return fail("trade_no_session");
          close(w, "declined");
          return reply(w.id);
        case "trade.cancel":
          if (w.state === "committing") return fail("trade_busy");
          close(w, "cancelled");
          return reply(w.id);
        case "trade.offer": {
          const { session: _, ...next } = message.req;
          return offer(me, w, next);
        }
        case "trade.confirm":
          return confirm(me, w, message.req.version);
      }
    }).catch((error) => {
      console.error(`trade message failed: ${describeError(error)}`);
      return fail("server_error");
    });
  }

  /** Closes the character's window, if any. */
  function end(characterId: string, reason: TradeCloseReason): void {
    const w = byCharacter.get(characterId);
    if (w) void serial(w, async () => close(w, reason));
  }

  /** The clock and the distance, once a second. */
  function check(): void {
    const t = now();
    for (const w of [...windows.values()]) {
      if (w.state === "committing" || w.state === "closed") continue;
      if (t >= w.expiresAt) {
        end(w.from, w.state === "invited" ? "expired" : "timeout");
        continue;
      }
      if (w.ghost) continue;
      if (!link.member(w.from) || !link.member(w.to)) end(w.from, "left");
      else if (apart(w.from, w.to)) end(w.from, "far");
    }
  }

  return {
    handle,
    end,
    check,
    /** Runs `check` every second; returns the stop. */
    start(): () => void {
      const timer = setInterval(check, CHECK_EVERY_MS);
      timer.unref();
      return () => clearInterval(timer);
    },
    /** Open windows, for tests and metrics. */
    get open(): number {
      return windows.size;
    },
  };
}

export type Trades = ReturnType<typeof createTrades>;
