/**
 * Trading in the WorldRoom (PLAN §19: the WorldRoom holds trades): the `trade.*` requests, the
 * 매점 게시판's reads, and the pushes back. The room registers this once and tells it who
 * joined and left; every rule lives in the modules beside it. Listing create, buy and cancel are
 * item operations and arrive through the room's `op` handlers like the rest.
 *
 * Requests follow the social systems' shape: one `done { type, n, data }` or
 * `refused { type, n, code }` each, and a window's changes pushed on `trade`.
 */
import {
  type BoardData,
  type BoardMessage,
  type BoardMessageName,
  boardSchema,
  type Refusal,
  TRADE_RATE,
  type TradeMessage,
  type TradeMessageName,
  tradeSchema,
  WORLD_MESSAGES,
  type WorldMessageSchema,
} from "@guago/shared";
import { type Db, describeError } from "../db/index.ts";
import { Buckets } from "../economy/buckets.ts";
import type { Executor } from "../economy/executor.ts";
import { places } from "../places.ts";
import { browseListings, myListings, priceHistory } from "./board.ts";
import { createTrades, type Trades } from "./session.ts";

/** What the room lends: its validated handlers, its members, its sockets and its block lists. */
export interface TradingHost {
  on<T>(
    type: string,
    schema: WorldMessageSchema<T>,
    run: (characterId: string, message: T) => Promise<{ type: string; body: unknown }>,
  ): void;
  member(characterId: string): { name: string; level: number } | undefined;
  send(characterId: string, type: string, body: unknown): void;
  /** Whether `owner` (online) blocked `other` (the social hub's block sets). */
  blocked(owner: string, other: string): boolean;
}

const TRADE_TYPES: TradeMessageName[] = [
  "trade.request",
  "trade.accept",
  "trade.decline",
  "trade.offer",
  "trade.confirm",
  "trade.cancel",
];
const BOARD_TYPES: BoardMessageName[] = ["listing.browse", "listing.mine", "listing.history"];

export interface TradingOptions {
  db: Db;
  executor: Pick<Executor, "executeAll">;
  /** The server clock (live/clock.ts): listing times, cooldowns and price history follow it. */
  clock?: () => Date;
}

type Answer = { type: string; body: unknown };
const done = (type: string, n: number, data: unknown): Answer => ({
  type: WORLD_MESSAGES.done,
  body: { type, n, data },
});
const refused = (type: string, n: number, code: Refusal["code"], retryMs?: number): Answer => ({
  type: WORLD_MESSAGES.refused,
  body: { type, n, code, ...(retryMs ? { retryMs } : {}) } satisfies Refusal,
});

export function createTrading({ db, executor, clock = () => new Date() }: TradingOptions) {
  let trades: Trades | undefined;
  const stops: (() => void)[] = [];
  const reads = new Buckets();

  async function board(me: string, m: BoardMessage): Promise<Answer> {
    const wait = reads.take(me, TRADE_RATE.board, Date.now());
    if (wait > 0) return refused(m.type, m.n, "rate_limited", wait);
    try {
      let data: BoardData[BoardMessageName];
      switch (m.type) {
        case "listing.browse":
          data = await browseListings(db, m.req, me, clock());
          break;
        case "listing.mine":
          data = { listings: await myListings(db, me, clock()) };
          break;
        case "listing.history":
          data = { history: await priceHistory(db, m.req, clock()) };
          break;
      }
      return done(m.type, m.n, data);
    } catch (error) {
      console.error(`board read failed: ${describeError(error)}`);
      return refused(m.type, m.n, "server_error");
    }
  }

  return {
    attach(host: TradingHost): void {
      const t = createTrades({
        db,
        executor,
        clock,
        // A block either way drops a trade request without a word to either side.
        isBlocked: host.blocked,
        link: {
          member: host.member,
          place(id) {
            const p = places.get(id);
            const at = p?.at();
            return p && at ? { roomId: p.roomId, x: at.x, y: at.y } : undefined;
          },
          send: (id, update) => host.send(id, WORLD_MESSAGES.trade, update),
        },
      });
      trades = t;
      for (const type of TRADE_TYPES) {
        host.on(type, tradeSchema(type) as WorldMessageSchema<TradeMessage>, async (me, m) => {
          const a = await t.handle(me, m);
          return a.ok
            ? done(m.type, m.n, { session: a.session })
            : refused(m.type, m.n, a.code, a.retryMs);
        });
      }
      for (const type of BOARD_TYPES) {
        host.on(type, boardSchema(type) as WorldMessageSchema<BoardMessage>, (me, m) =>
          board(me, m),
        );
      }
      stops.push(places.listen((id) => t.end(id, "map")));
      stops.push(t.start());
    },
    /** The character's WorldRoom seat dropped or left. */
    left(characterId: string): void {
      trades?.end(characterId, "left");
    },
    /** A new seat of the character joined: whatever the old one had open closes. */
    joined(characterId: string): void {
      trades?.end(characterId, "replaced");
    },
    detach(): void {
      for (const stop of stops.splice(0)) stop();
      trades = undefined;
    },
  };
}

export type Trading = ReturnType<typeof createTrading>;
