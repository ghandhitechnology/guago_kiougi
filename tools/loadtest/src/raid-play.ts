/**
 * What a load-test bot does about a boss fight's mechanic (PLAN §5 gimmicks), read from the
 * snapshot as a browser would: the boss record's phase and mode, the bodies' kinds and positions.
 * A share of the 반자동 bots play the mechanic (`--objectives`); the rest fight as usual.
 *
 * - 크로톤 학당: walk one unit square corner to corner and back, so the weak point opens to them.
 * - 엘레아 경주로: stand in the circle being filled until the paradox breaks.
 * - 리케이온: hold the lit element zone in 논제 2; in 논제 4 stand west of the block on the ice
 *   and aim east, so its knocks slide the block across.
 */
import { mapById, monsterKindIndex } from "@guago/content";
import {
  AristotleMode,
  CROTON_GRID,
  Q,
  type WireBoss,
  type WireMember,
  ZenoMode,
} from "@guago/shared";

export interface Goal {
  readonly x: number;
  readonly y: number;
  /** Close enough when within this many px. */
  readonly near: number;
  /** Where to aim books, as a point; null leaves aiming to the server. */
  readonly aim: { readonly x: number; readonly y: number } | null;
}

const RINGS = ["ring-96", "ring-48", "ring-24"] as const;
const RING_R = [96, 48, 24] as const;
const ZONES = ["zone-earth", "zone-water", "zone-air", "zone-fire"] as const;

export class RaidPlay {
  private readonly map: string;
  private readonly role: number;
  private readonly marks: Readonly<Record<string, { x: number; y: number }>>;
  private leg = 0;
  private readonly blockKind: number;
  private readonly bossKinds: ReadonlySet<number>;

  constructor(map: string, role: number) {
    this.map = map;
    this.role = role;
    const def = mapById(map);
    this.marks = def && "marks" in def ? def.marks : {};
    this.blockKind = safeKind("aristotle-block");
    this.bossKinds = new Set(
      ["pythagoreans", "zeno", "zeno-part", "aristotle"].map(safeKind).filter((k) => k >= 0),
    );
  }

  /** Whether this map has a mechanic a bot can play. */
  static plays(map: string): boolean {
    return map === "p1-croton-school" || map === "p1-elea-track" || map === "p1-lyceum";
  }

  /** Where to stand and aim now, or null to fight as usual. */
  goal(
    boss: WireBoss | null,
    members: ReadonlyMap<number, WireMember>,
    x: number,
    y: number,
  ): Goal | null {
    if (!boss || boss.flags & 8) return null;
    switch (this.map) {
      case "p1-croton-school":
        return this.diagonal(members, x, y);
      case "p1-elea-track": {
        if (boss.mode & ZenoMode.Broken) return null;
        const filled = Math.min(2, boss.mode & ZenoMode.Filled);
        const c = this.marks[RINGS[filled] as string];
        if (!c) return null;
        const r = RING_R[filled] as number;
        const a = (this.role * 2.4) % (Math.PI * 2);
        return {
          x: c.x + Math.cos(a) * r * 0.4,
          y: c.y + Math.sin(a) * r * 0.4,
          near: 4,
          aim: null,
        };
      }
      case "p1-lyceum":
        if (boss.phase === 2) {
          const lit = (boss.mode & AristotleMode.Zone) - 1;
          const c = lit >= 0 ? this.marks[ZONES[lit] as string] : undefined;
          if (!c) return null;
          const a = (this.role * 2.4) % (Math.PI * 2);
          return { x: c.x + Math.cos(a) * 30, y: c.y + Math.sin(a) * 20, near: 6, aim: null };
        }
        if (boss.phase === 4 && !(boss.mode & AristotleMode.Stunned)) {
          for (const m of members.values()) {
            if (m.kind !== this.blockKind) continue;
            const bx = m.qx / Q;
            const by = m.qy / Q;
            const lane = (this.role % 3) - 1;
            return { x: bx - 26, y: by + lane * 6, near: 5, aim: { x: bx + 40, y: by } };
          }
        }
        return null;
    }
    return null;
  }

  /** Corner to corner across one unit square near the school's formation, and back. */
  private diagonal(members: ReadonlyMap<number, WireMember>, x: number, y: number): Goal | null {
    const G = CROTON_GRID;
    let bx = G.x + (G.cols * G.cell) / 2;
    let by = G.y + (G.rows * G.cell) / 2;
    for (const m of members.values()) {
      if (!this.bossKinds.has(m.kind)) continue;
      bx = m.qx / Q;
      by = m.qy / Q;
      break;
    }
    const bc = Math.floor((bx - G.x) / G.cell);
    const br = Math.floor((by - G.y) / G.cell);
    const c = Math.max(0, Math.min(G.cols - 1, bc + ((this.role % 5) - 2) * 2));
    const r = Math.max(0, Math.min(G.rows - 1, br + 2 + (this.role % 2) - (br > 4 ? 4 : 0)));
    const x0 = G.x + c * G.cell;
    const y0 = G.y + r * G.cell;
    const a = { x: x0 - 5, y: y0 - 5 };
    const b = { x: x0 + G.cell + 5, y: y0 + G.cell + 5 };
    const at = this.leg === 0 ? a : b;
    if (Math.hypot(at.x - x, at.y - y) <= 3) this.leg = 1 - this.leg;
    const to = this.leg === 0 ? a : b;
    return { x: to.x, y: to.y, near: 0, aim: { x: bx, y: by } };
  }
}

function safeKind(id: string): number {
  try {
    return monsterKindIndex(id);
  } catch {
    return -1;
  }
}
