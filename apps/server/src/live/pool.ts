/**
 * What the 자습 pool needs at logout (PLAN §9): the session's best 10-minute income in the last
 * field hunted, measured from the credit combat hands the grant buffer, and where the player
 * logged out (field, hub, 자습실, 기숙사) from the map they stood on.
 */
import { type BuiltMap, buildAllMaps, type Drop, LIFECYCLES } from "@guago/content";
import {
  bestWindowRate,
  type IncomeEvent,
  type LogoutPlace,
  type Rate,
  TILE_SIZE,
} from "@guago/shared";

/** Income is kept in buckets this many seconds wide: a long session stays a few thousand rows. */
const BUCKET_SECONDS = 5;
/** Twelve hours of buckets; older income no longer matters to a 10-minute window. */
const MAX_BUCKETS = (12 * 3600) / BUCKET_SECONDS;

interface Session {
  field: string;
  /** Game ms the field's income began. */
  since: number;
  events: IncomeEvent[];
  sheets: Map<string, number>;
}

export interface Measured extends Rate {
  field: string;
  sheetBook: string | null;
}

export class IncomeTracker {
  private readonly now: () => number;
  private readonly sessions = new Map<string, Session>();

  constructor(now: () => number) {
    this.now = now;
  }

  /** One credit as combat gave it to the grant buffer (`GrantBuffer.add`). */
  credit(characterId: string, credit: { exp: number; drops: readonly Drop[] }): void {
    const field = credit.drops[0]?.source.fieldId;
    if (!field) return;
    const now = this.now();
    let s = this.sessions.get(characterId);
    // The pool follows the last field hunted: a new field starts the measurement over.
    if (!s || s.field !== field) {
      s = { field, since: now, events: [], sheets: new Map() };
      this.sessions.set(characterId, s);
    }
    let pinecone = 0;
    let sheets = 0;
    let ink = 0;
    for (const { item } of credit.drops) {
      if (item.kind === "coin") pinecone += item.amount;
      if (item.kind === "page") {
        sheets += item.qty;
        s.sheets.set(item.book, (s.sheets.get(item.book) ?? 0) + item.qty);
      }
      if (item.kind === "ink") ink += item.qty;
    }
    const t = Math.floor((now - s.since) / 1000 / BUCKET_SECONDS) * BUCKET_SECONDS;
    const last = s.events.at(-1);
    if (last && last.t === t) {
      s.events[s.events.length - 1] = {
        t,
        exp: last.exp + credit.exp,
        pinecone: last.pinecone + pinecone,
        sheets: last.sheets + sheets,
        ink: last.ink + ink,
      };
    } else {
      s.events.push({ t, exp: credit.exp, pinecone, sheets, ink });
      if (s.events.length > MAX_BUCKETS) s.events.shift();
    }
  }

  /** The best full window this session, or null below one window of hunting. */
  measure(characterId: string): Measured | null {
    const s = this.sessions.get(characterId);
    if (!s) return null;
    const rate = bestWindowRate(s.events);
    if (rate.exp <= 0) return null;
    const book = [...s.sheets].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return { ...rate, field: s.field, sheetBook: book };
  }

  end(characterId: string): void {
    this.sessions.delete(characterId);
  }
}

// Where a player logged out ---------------------------------------------------------------

let maps: Map<string, BuiltMap> | undefined;

function builtMaps(): Map<string, BuiltMap> {
  maps ??= new Map(buildAllMaps().map((r) => [r.map.id, r.map]));
  return maps;
}

const ERA_FIELDS = new Set(LIFECYCLES.flatMap((l) => [...l.fields, l.danger]));

/**
 * Field when the map is a hunting field (an era field, or a map with monster zones); 자습실 or
 * 기숙사 when the spot is inside a logout zone with that bonus; anywhere else is the hub.
 */
export function logoutPlace(mapId: string, x: number, y: number): LogoutPlace {
  if (ERA_FIELDS.has(mapId)) return "field";
  const map = builtMaps().get(mapId);
  if (!map) return "hub";
  if (map.zones.some((z) => z.kind === "monsters")) return "field";
  const tx = x / TILE_SIZE;
  const ty = y / TILE_SIZE;
  for (const z of map.zones) {
    if (z.kind !== "logout") continue;
    const r = z.rect;
    if (tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h) {
      return z.bonus === "study" ? "study-hall" : "dorm";
    }
  }
  return "hub";
}

/** The campus maps: 단정한 복장 counts here (PLAN §11 "in the hub"). */
export function isHub(mapId: string): boolean {
  const map = builtMaps().get(mapId);
  return map !== undefined && !map.zones.some((z) => z.kind === "monsters");
}
