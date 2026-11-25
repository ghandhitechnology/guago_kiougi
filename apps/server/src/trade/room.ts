/**
 * Trading in the WorldRoom (PLAN §19: the WorldRoom holds trades): the `trade.*` messages, the
 * 매점 게시판's reads, and the pushes back. The room registers this once and tells it who
 * joined and left; every rule lives in the modules beside it. Listing create, buy and cancel are
 * item operations and arrive through the room's `op` handlers like the rest.
 */
import {
  BOARD_MESSAGES,
  type BoardMessage,
  type BoardMessageName,
  type BoardReply,
  boardSchema,
  TRADE_MESSAGES,
  TRADE_RATE,
  type TradeMessage,
  type TradeMessageName,
  tradeSchema,
  type WorldMessageSchema,
} from "@guago/shared";
import { type Db, describeError } from "../db/index.ts";
import { Buckets } from "../economy/buckets.ts";
import type { Executor } from "../economy/executor.ts";
import { places } from "../places.ts";
import { browseListings, myListings, priceHistory } from "./board.ts";
import { createTrades, type IsBlocked, nobodyBlocked, type Trades } from "./session.ts";

/** What the room lends: its validated handlers, its members, its sockets. */
export interface TradingHost {
  on<T>(
    type: string,
    schema: WorldMessageSchema<T>,
    run: (characterId: string, message: T) => Promise<{ type: string; body: unknown }>,
  ): void;
  member(characterId: string): { name: string; level: number } | undefined;
  send(characterId: string, type: string, body: unknown): void;
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
  /** Block lists, from the social systems once they land; nobody is blocked until then. */
  isBlocked?: IsBlocked;
}

export function createTrading({ db, executor, isBlocked = nobodyBlocked }: TradingOptions) {
  let trades: Trades | undefined;
  const stops: (() => void)[] = [];
  const reads = new Buckets();

  async function board(me: string, m: BoardMessage): Promise<BoardReply> {
    const wait = reads.take(me, TRADE_RATE.board, Date.now());
    if (wait > 0) return { id: m.id, ok: false, error: "rate_limited", retryMs: wait };
    try {
      switch (m.type) {
        case "listing.browse":
          return { id: m.id, ok: true, ...(await browseListings(db, m.req)) };
        case "listing.mine":
          return { id: m.id, ok: true, listings: await myListings(db, me), next: null };
        case "listing.history":
          return { id: m.id, ok: true, history: await priceHistory(db, m.req) };
      }
    } catch (error) {
      console.error(`board read failed: ${describeError(error)}`);
      return { id: m.id, ok: false, error: "server_error" };
    }
  }

  return {
    attach(host: TradingHost): void {
      const t = createTrades({
        db,
        executor,
        isBlocked,
        link: {
          member: host.member,
          place(id) {
            const p = places.get(id);
            const at = p?.at();
            return p && at ? { roomId: p.roomId, x: at.x, y: at.y } : undefined;
          },
          send: (id, update) => host.send(id, TRADE_MESSAGES.update, update),
        },
      });
      trades = t;
      for (const type of TRADE_TYPES) {
        host.on(type, tradeSchema(type) as WorldMessageSchema<TradeMessage>, async (me, m) => ({
          type: TRADE_MESSAGES.result,
          body: await t.handle(me, m),
        }));
      }
      for (const type of BOARD_TYPES) {
        host.on(type, boardSchema(type) as WorldMessageSchema<BoardMessage>, async (me, m) => ({
          type: BOARD_MESSAGES.reply,
          body: await board(me, m),
        }));
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
