import { decodeEmblem, type Emblem } from "@guago/shared";

/**
 * What the map room says about the bodies on this map that the WorldRoom does not: what each one
 * wears and which 동아리 it belongs to. The world scene hands each synced player over as it
 * appears and lets go when it leaves; nameplates, the player card and the 과잠 read from here.
 *
 * ```ts
 * worldPeople.seen(p.sid, p);   // in the map patch, for every seated player, the own one too
 * worldPeople.gone(sid);        // when a body is pruned
 * normalizeLook(meta, clubDress(look, p));   // dresses a club member in the 과잠
 * ```
 */

/** The fields of a synced player read here; the schema instance itself is passed. */
export interface SyncedBody {
  readonly sid: string;
  readonly name: string;
  readonly major: string;
  readonly clubId: number;
  readonly club: string;
  readonly jacket: string;
  readonly emblem: string;
  readonly look?: {
    readonly body: string;
    readonly hair: string;
    readonly hairColor: string;
    readonly face: string;
    readonly uniform: string;
    readonly accessories: Iterable<string>;
  };
}

export interface ClubTag {
  readonly id: number;
  readonly name: string;
  readonly jacket: string;
  readonly emblem: Emblem;
}

/** A body's club, or undefined for none (or an emblem that does not decode). */
export function clubOf(p: SyncedBody): ClubTag | undefined {
  if (!p.clubId) return undefined;
  const emblem = decodeEmblem(p.emblem);
  return emblem ? { id: p.clubId, name: p.club, jacket: p.jacket, emblem } : undefined;
}

/** The 과잠 part of the student rig. */
const JACKET_PART = "varsity";

/**
 * A look with the 과잠 on for a club member, in the club's colour; a look without one for anyone
 * else, so leaving a club takes the jacket off.
 */
export function clubDress<
  L extends { readonly accessories: readonly string[]; readonly jacket?: string },
>(look: L, p: Pick<SyncedBody, "clubId" | "jacket">): L {
  const rest = look.accessories.filter((a) => a !== JACKET_PART);
  if (!p.clubId || !p.jacket) {
    const { jacket: _drop, ...plain } = look;
    return { ...plain, accessories: rest } as unknown as L;
  }
  return { ...look, accessories: [...rest, JACKET_PART], jacket: p.jacket };
}

class WorldPeople {
  private readonly bodies = new Map<string, SyncedBody>();
  /** The club each body was last seen in, to notice joins and leaves. */
  private readonly clubs = new Map<string, string>();
  private readonly listeners = new Set<(sid: string) => void>();

  /** A seated player in this patch. Cheap to call every patch. */
  seen(sid: string, p: SyncedBody): void {
    const known = this.bodies.get(sid);
    const club = `${p.clubId}|${p.club}|${p.jacket}|${p.emblem}`;
    if (known === p && this.clubs.get(sid) === club) return;
    this.bodies.set(sid, p);
    this.clubs.set(sid, club);
    for (const l of this.listeners) l(sid);
  }

  gone(sid: string): void {
    if (!this.bodies.delete(sid)) return;
    this.clubs.delete(sid);
    for (const l of this.listeners) l(sid);
  }

  /** Forgets every body, as on leaving a map. */
  clear(): void {
    for (const sid of [...this.bodies.keys()]) this.gone(sid);
  }

  get(sid: string): SyncedBody | undefined {
    return this.bodies.get(sid);
  }

  /** The session of the body with this name on this map. */
  sidOf(name: string): string | undefined {
    for (const [sid, p] of this.bodies) if (p.name === name) return sid;
    return undefined;
  }

  /** Calls `fn` with a session id whenever that body appears, leaves or changes club. */
  on(fn: (sid: string) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export const worldPeople = new WorldPeople();
