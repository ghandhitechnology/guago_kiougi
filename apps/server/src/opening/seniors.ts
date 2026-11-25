/**
 * The seniors who hold the stairs' landings (PLAN §4 beat 4). Each is a fight body the room's
 * encounter seats itself: a starter kit of their class, 반자동 with no inputs so it stands at its
 * post and casts at the nearest 오답, invulnerable, and never dodging. It is not a pawn: it has
 * no client, no seat and no character, so channels never count it and nothing it earns reaches
 * the economy (the room hands EXP and drops only to pawns; its EXP multiplier is zero and its
 * drops are cleared every tick). Its body slot lies past the room's synced slots, so clients
 * draw the cast member standing there and only its attacks come from the snapshot.
 */
import { type BuiltMap, OPENING_STAIRS, type OpeningSenior, STARTER_BOOKS } from "@guago/content";
import { type FightWorld, MAP_SEATS, Mode, NO_STATS, type Player } from "@guago/shared";

/** Ticks past any fight: a held senior never takes a hit and never rolls. */
const HELD = 2 ** 31 - 1;

/** Seats a senior at their post; undefined when the map has no spot for them. */
export function seatSenior(
  w: FightWorld,
  def: BuiltMap,
  senior: OpeningSenior,
  index: number,
): Player | undefined {
  const at = senior.post
    ? def.marks[senior.post]
    : def.npcs.find((n) => n.speaker === senior.speaker);
  if (!at) return undefined;
  const level = OPENING_STAIRS.seniorLevel;
  const kit = w.rules.kit({
    major: senior.major,
    minor: null,
    level,
    stats: NO_STATS,
    books: STARTER_BOOKS[senior.major].map((book) => ({
      def: book,
      level,
      grade: 0,
      pilgi: 0,
      evolved: false,
    })),
    tools: [],
  });
  const p = w.addPlayer(
    `senior:${senior.speaker}`,
    MAP_SEATS + index,
    at.x,
    at.y,
    { ...kit, damage: kit.damage * OPENING_STAIRS.seniorDamage, dropMult: 0, coinMult: 0 },
    level,
  );
  p.mode = Mode.Semi;
  p.expMult = 0;
  holdSenior(w, p);
  return p;
}

/** After each step: still invulnerable, never rolling, and nothing it earned kept. */
export function holdSenior(w: FightWorld, p: Player): void {
  p.invulnerableUntil = HELD;
  p.dodgeReadyAt = HELD;
  p.expEarned = 0;
  for (const k of w.pickups) if (k.alive && k.owner === p.index) k.alive = false;
}
