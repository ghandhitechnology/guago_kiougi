/**
 * What the fight draws and plays, looked up once from the art metadata and the content: each
 * monster kind's sprites and animations by state, each book's body, impact and area art with its
 * class colour and sounds. Everything is data: a book whose art is not drawn yet falls back to
 * its class's shape for its attack kind, and picks up its own art the build after it lands.
 */
import type { ArtMetadata } from "@guago/art";
import type { HitClass } from "@guago/audio";
import {
  BOOKS,
  type ClassId,
  MONSTERS,
  ODAP_GOLEM,
  PROOF_CUES,
  REACTIONS,
  simRules,
} from "@guago/content";
import { MState, type SimRules } from "@guago/shared";
import { paletteColor } from "../render/grade.ts";

export const COMBAT = "combat";

/** A monster kind as drawn. Animation names are full keys (`odap/hop`), resolved per state. */
export interface MonsterArt {
  readonly id: string;
  readonly sprite: string;
  readonly elite: string | null;
  readonly behavior: number;
  /** Animation key per `MState`, falling back to move or idle where the art has none. */
  readonly anims: readonly string[];
  readonly eliteAnims: readonly string[] | null;
  readonly die: string | null;
  readonly eliteDie: string | null;
  /** Hops: squash on landing. */
  readonly hops: boolean;
  readonly shadow: string;
  readonly height: number;
  readonly hitCue: string;
  readonly dieCue: string;
  readonly attackCue: string | null;
  /** Debris: 오답 tears into paper, everything else breaks into chunks of its own colour. */
  readonly paper: boolean;
  readonly tint: number;
}

/** A book's attack at level 1, in ticks and pixels: enough to draw a predicted swing. */
export interface BookShape {
  readonly lob: boolean;
  /** px per tick. */
  readonly speed: number;
  readonly length: number;
  readonly radius: number;
  readonly width: number;
  readonly count: number;
  readonly duration: number;
  /** Lob peak or beam amplitude; beam wavelength. */
  readonly a: number;
  readonly b: number;
  /** How far the swing reaches along the aim. */
  readonly reach: number;
}

const NO_SHAPE: BookShape = {
  lob: false,
  speed: 6,
  length: 120,
  radius: 4,
  width: 8,
  count: 1,
  duration: 6,
  a: 0,
  b: 0,
  reach: 120,
};

/** A book as drawn and heard. */
export interface BookArt {
  readonly id: string;
  readonly cls: HitClass;
  readonly kind: string;
  /** Moving part: orbit body, projectile, beam segment, minion, crack. Null: the class fallback. */
  readonly body: string | null;
  readonly bodyAnim: string | null;
  readonly hit: string | null;
  readonly hitAnim: string | null;
  readonly area: string | null;
  readonly areaAnim: string | null;
  readonly cast: string;
  readonly impact: string;
  /** Class colour (light) and its deep tone, from the palette. */
  readonly color: number;
  readonly deep: number;
  /** Rotates with its heading (bolts, beams) or spins (rocks, tomes, flasks). */
  readonly turns: boolean;
}

export const CLASS_RAMP: Readonly<Record<HitClass, [string, string]>> = {
  math: ["stone.bright", "navy.deep"],
  physics: ["plum.light", "plum.deep"],
  chemistry: ["sea.light", "sea.deep"],
  biology: ["grass.light", "grass.deep"],
  earth: ["gold.light", "clay.dark"],
};

/** First animation of a sprite that exists among `names`, as a full key, or null. */
function animOf(meta: ArtMetadata, sprite: string, names: readonly string[]): string | null {
  const s = meta.sprites[sprite];
  if (!s) return null;
  for (const n of names) if (s.anims[n]) return `${sprite}/${n}`;
  return null;
}

function firstAnim(meta: ArtMetadata, sprite: string | null): string | null {
  if (!sprite) return null;
  const s = meta.sprites[sprite];
  const name = s ? Object.keys(s.anims)[0] : undefined;
  return name ? `${sprite}/${name}` : null;
}

/** Animation for each monster state, by the names the archetypes draw. */
const STATE_ANIMS: Readonly<Record<number, readonly string[]>> = {
  [MState.Idle]: ["idle"],
  [MState.Move]: ["hop", "move", "walk", "idle"],
  [MState.Windup]: ["windup", "fuse", "idle"],
  [MState.Charge]: ["charge", "rush", "move"],
  [MState.Recover]: ["recover", "idle"],
  [MState.Fire]: ["fire", "cast", "windup", "idle"],
  [MState.Fuse]: ["fuse", "burst", "idle"],
  [MState.Cast]: ["cast", "fire", "idle"],
  [MState.Guard]: ["guard", "idle"],
  [MState.Block]: ["block", "guard", "idle"],
  [MState.Rush]: ["rush", "move", "hop"],
  [MState.Slam]: ["slam", "idle"],
  [MState.Arrive]: ["idle"],
};

function stateAnims(meta: ArtMetadata, sprite: string): string[] {
  const out: string[] = [];
  for (let s = 0; s <= MState.Arrive; s++) {
    out.push(animOf(meta, sprite, STATE_ANIMS[s] ?? ["idle"]) ?? `${sprite}/idle`);
  }
  return out;
}

export class Catalog {
  readonly meta: ArtMetadata;
  readonly rules: SimRules;
  readonly monsters: MonsterArt[] = [];
  readonly books: BookArt[] = [];
  /** Each book's evolved form, by the same index. */
  readonly evolved: BookArt[] = [];
  /**
   * Evolved forms drawn with art no content cue names: the art lane's `evo-<evolution id>`
   * sprites, used for the evolved body where the evolution's cue repeats the base book's.
   */
  readonly unnamed: string[] = [];
  /** Reaction index to its burst art and sound. */
  readonly reactions: { readonly vfx: string | null; readonly sfx: string }[] = [];
  readonly statusIds: readonly string[];
  readonly shapes: BookShape[] = [];
  readonly proof = PROOF_CUES;
  private readonly colors = new Map<string, number>();

  constructor(meta: ArtMetadata) {
    this.meta = meta;
    this.rules = simRules();
    for (const k of this.rules.monsters) {
      const def = MONSTERS.find((m) => m.id === k.id);
      const sprite = meta.sprites[k.sprite] ? k.sprite : "odap";
      const eliteName = `${sprite}-elite`;
      const elite = meta.sprites[eliteName] ? eliteName : null;
      const s = meta.sprites[sprite];
      const size = s?.size ?? [16, 16];
      const big = (size[0] as number) >= 28;
      const golem = k.id === ODAP_GOLEM.id;
      this.monsters.push({
        id: k.id,
        sprite,
        elite,
        behavior: k.behavior,
        anims: stateAnims(meta, sprite),
        eliteAnims: elite ? stateAnims(meta, elite) : null,
        die: animOf(meta, sprite, ["die"]),
        eliteDie: elite ? animOf(meta, elite, ["die"]) : null,
        hops: Boolean(s?.anims.hop),
        shadow: golem || big ? "shadow-l" : (size[0] as number) <= 13 ? "shadow-s" : "shadow-m",
        height: size[1] as number,
        hitCue: def?.cues.hit ?? (golem ? "sfx.monster.odap.hit" : "sfx.monster.odap.hit"),
        dieCue: def?.cues.die ?? (golem ? ODAP_GOLEM.cues.die : "sfx.monster.odap.die"),
        attackCue: def?.cues.attack ?? (golem ? ODAP_GOLEM.cues.slam : null),
        paper: sprite.startsWith("odap") || golem,
        tint: this.color(MONSTER_TINT[k.id] ?? "stone.pale"),
      });
    }
    for (const id of this.rules.books) {
      const def = BOOKS.find((b) => b.id === id);
      this.books.push(this.bookArt(id, def, false));
      this.evolved.push(this.bookArt(id, def, true));
    }
    for (const id of this.rules.books) this.shapes.push(shapeOf(BOOKS.find((b) => b.id === id)));
    for (const r of REACTIONS) {
      this.reactions.push({ vfx: real(meta, r.cue.vfx), sfx: r.cue.sfx });
    }
    this.statusIds = this.rules.statuses.map((s) => s.id);
  }

  /** A 해솔 64 colour by name. */
  color(name: string): number {
    let c = this.colors.get(name);
    if (c === undefined) {
      c = paletteColor(this.meta, name);
      this.colors.set(name, c);
    }
    return c;
  }

  monster(kind: number): MonsterArt {
    return (this.monsters[kind] ?? this.monsters[0]) as MonsterArt;
  }

  shape(index: number): BookShape {
    return this.shapes[index] ?? NO_SHAPE;
  }

  book(index: number, evolved = false): BookArt {
    const list = evolved ? this.evolved : this.books;
    return (list[index] ?? list[0] ?? this.books[0]) as BookArt;
  }

  /** A book's art, base or evolved, from its content cues. */
  private bookArt(id: string, def: (typeof BOOKS)[number] | undefined, evolved: boolean): BookArt {
    const meta = this.meta;
    const cls = (def?.subject ?? "math") as ClassId as HitClass;
    const [light, deep] = CLASS_RAMP[cls] ?? CLASS_RAMP.math;
    const base = def?.cues;
    const cues = evolved ? def?.evolution.cues : base;
    const real = (name: string | undefined) => (name && meta.sprites[name] ? name : null);
    let body = real(cues?.body);
    if (evolved && def && cues?.body === base?.body) {
      const own = `evo-${def.evolution.id}`;
      if (meta.sprites[own]) {
        body = own;
        this.unnamed.push(own);
      }
    }
    const hit = real(cues?.hit);
    const area = real(cues?.area);
    const kind = (evolved ? def?.evolution.attack?.kind : undefined) ?? def?.attack?.kind ?? "none";
    return {
      id,
      cls,
      kind,
      body,
      bodyAnim: firstAnim(meta, body),
      hit,
      hitAnim: firstAnim(meta, hit),
      area,
      areaAnim: firstAnim(meta, area),
      cast: cues?.cast ?? `sfx.book.${id}.cast`,
      impact: cues?.impact ?? `sfx.book.${id}.hit`,
      color: this.color(light),
      deep: this.color(deep),
      turns: body === "fx-graph-beam" || body === "evo-fourier" || body === "fx-scalpel",
    };
  }

  /** The animation key of a sprite's named animation, or null when it has none by that name. */
  anim(sprite: string, name: string): string | null {
    return this.meta.sprites[sprite]?.anims[name] ? `${sprite}/${name}` : null;
  }

  /** Frames of a sprite's named animation. */
  frames(sprite: string, name: string): readonly string[] {
    return this.meta.sprites[sprite]?.anims[name]?.frames ?? [];
  }

  has(sprite: string): boolean {
    return this.meta.sprites[sprite] !== undefined;
  }

  /** Atlas of a sprite. */
  atlas(sprite: string): string {
    return this.meta.sprites[sprite]?.atlas ?? COMBAT;
  }

  /** A frame name of a sprite: its first, or `sprite/name`. */
  frame(sprite: string, name?: string): string {
    const s = this.meta.sprites[sprite];
    if (!s) return "";
    if (name) return `${sprite}/${name}`;
    return s.frames[0] ?? "";
  }
}

const TICKS = 20;

/** The level-1 shape of a book's attack, from its content numbers. */
function shapeOf(def: (typeof BOOKS)[number] | undefined): BookShape {
  const at = def?.attack as Record<string, unknown> | null | undefined;
  if (!at) return NO_SHAPE;
  const num = (k: string, d = 0) => (typeof at[k] === "number" ? (at[k] as number) : d);
  switch (at.kind) {
    case "projectile": {
      const speed = num("speed", 120) / TICKS;
      const range = num("range", 120);
      const g = num("gravity") / (TICKS * TICKS);
      const flight = Math.max(1, Math.round(range / Math.max(0.1, speed)));
      return {
        lob: g > 0,
        speed,
        length: range,
        radius: num("radius", 4),
        width: 0,
        count: 1,
        duration: flight,
        a: (g * flight * flight) / 8,
        b: 0,
        reach: range,
      };
    }
    case "beam":
      return {
        ...NO_SHAPE,
        length: num("length", 120),
        width: num("width", 8),
        duration: Math.max(2, Math.round(num("duration", 0.3) * TICKS)),
        a: num("amplitude"),
        b: num("wavelength"),
        reach: num("length", 120),
      };
    case "cone":
      return {
        ...NO_SHAPE,
        length: num("range", 40),
        width: ((num("angle", 40) / 2) * Math.PI) / 180,
        count: Math.max(1, num("hits", 1)),
        duration: Math.max(1, Math.round(num("duration", 0.15) * TICKS)),
        reach: num("range", 40),
      };
    default:
      return NO_SHAPE;
  }
}

function real(meta: ArtMetadata, name: string): string | null {
  return meta.sprites[name] ? name : null;
}

/** The colour a monster's debris takes. */
const MONSTER_TINT: Readonly<Record<string, string>> = {
  odap: "red.light",
  "odap-pencil": "gold.light",
  rational: "stone.light",
  "element-fire": "clay.light",
  "element-water": "sea.light",
  "element-air": "stone.bright",
  "element-earth": "clay.mid",
  "element-earth-pebble": "clay.mid",
  "cave-shadow": "plum.dark",
  tortoise: "grass.mid",
  "odap-golem": "red.mid",
};
