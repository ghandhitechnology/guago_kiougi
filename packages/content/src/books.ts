import { BOOK_BASE_DAMAGE, BookGrade } from "@guago/shared";
import type {
  Attack,
  AttackKind,
  BeamAttack,
  ChainAttack,
  ConeAttack,
  LevelStep,
  OrbitAttack,
  ProjectileAttack,
  SummonAttack,
  TelegraphAttack,
  ToolDef,
} from "./attacks.ts";
import type { ClassId } from "./classes.ts";

/** Ids the client resolves against the art atlases and the audio bank. */
export interface BookCues {
  /** Slot and bag icon. */
  readonly icon: string;
  /** The moving part: orbit body, beam segment, projectile, minion, crack. */
  readonly body: string;
  readonly hit: string;
  /** Pool, telegraph mark or other lingering area, when the attack leaves one. */
  readonly area?: string;
  readonly cast: string;
  readonly impact: string;
}

/** A grade 심화서 book at level 100 with its tool at level 5 evolves (PLAN §8). Built in M3. */
export interface Evolution {
  readonly id: string;
  readonly name: string;
  readonly requires: {
    readonly grade: BookGrade;
    readonly level: number;
    readonly toolLevel: number;
  };
  readonly kind: AttackKind;
  /** What the evolved form does, for the M3 engineer. Never shown to players. */
  readonly design: string;
}

export interface BookDef<A extends Attack = Attack> {
  readonly id: string;
  readonly name: string;
  readonly subject: ClassId;
  readonly description: string;
  /** Linked tool id. */
  readonly tool: string;
  readonly base: number;
  readonly attack: A;
  readonly levels: readonly LevelStep<A>[];
  readonly cues: BookCues;
  readonly evolution: Evolution;
}

function book<A extends Attack>(def: BookDef<A>): BookDef<A> {
  return def;
}

const EVOLVE = { grade: BookGrade.Advanced, level: 100, toolLevel: 5 } as const;

/** Linked tools of the M2 books. Multipliers are per tool level, 1 to 5. */
export const TOOLS: readonly ToolDef[] = [
  {
    id: "compass",
    name: "컴퍼스",
    stat: "area",
    perLevel: 0.08,
    description: "바늘 쪽은 아무도 잡지 않는다.",
    icon: "tool/compass",
  },
  {
    id: "grid-ruler",
    name: "모눈자",
    stat: "range",
    perLevel: 0.1,
    description: "1밀리미터까지 잰다. 쓸데없이 길다.",
    icon: "tool/grid-ruler",
  },
  {
    id: "weight",
    name: "저울추",
    stat: "knock",
    perLevel: 0.2,
    description: "1킬로그램짜리다. 왜 필통에 들어 있는지는 아무도 모른다.",
    icon: "tool/weight",
  },
  {
    id: "battery",
    name: "건전지",
    stat: "chain",
    perLevel: 1,
    description: "혀에 대 보면 아직 쓸 만하다.",
    icon: "tool/battery",
  },
  {
    id: "pipette",
    name: "피펫",
    stat: "statusDuration",
    perLevel: 0.1,
    description: "한 방울씩. 정확히 한 방울씩.",
    icon: "tool/pipette",
  },
  {
    id: "alcohol-lamp",
    name: "알코올램프",
    stat: "burn",
    perLevel: 0.15,
    description: "뚜껑을 덮어서 끈다. 입으로 불면 혼난다.",
    icon: "tool/alcohol-lamp",
  },
  {
    id: "microscope",
    name: "현미경",
    stat: "minionCap",
    perLevel: 1,
    description: "배율을 올리면 세포가 늘어난 것처럼 보인다. 실제로 늘어난다.",
    icon: "tool/microscope",
  },
  {
    id: "tweezers",
    name: "핀셋",
    stat: "bleed",
    perLevel: 0.15,
    description: "끝이 너무 뾰족하다. 그래서 좋다.",
    icon: "tool/tweezers",
  },
  {
    id: "seismometer",
    name: "지진계",
    stat: "telegraphSpeed",
    perLevel: 0.06,
    description: "자습실 책상만 흔들려도 바늘이 튄다. 범인은 대개 다리 떠는 사람이다.",
    icon: "tool/seismometer",
  },
  {
    id: "rock-hammer",
    name: "돌망치",
    stat: "impact",
    perLevel: 0.1,
    description: "표본을 깨는 용도다. 다른 것도 잘 깬다.",
    icon: "tool/rock-hammer",
  },
];

// ── 수학 ────────────────────────────────────────────────────────────────────

/** Sides grow 3 → 8 with level; the evolution closes the polygon into a circle. */
export const WANGDO = book<OrbitAttack>({
  id: "wangdo",
  name: "수학의 왕도",
  subject: "math",
  description:
    "기하학에 왕도는 없다고 했다. 그래서 직접 만들었다. 정다각형이 주위를 돌고, 변이 하나씩 늘어 언젠가 원이 된다.",
  tool: "compass",
  base: BOOK_BASE_DAMAGE,
  attack: {
    kind: "orbit",
    cooldown: 3,
    damage: 0.6,
    knock: 40,
    count: 3,
    orbitRadius: 28,
    bodyRadius: 5,
    period: 1.2,
    duration: 2,
    hitInterval: 0.5,
  },
  levels: [
    { at: 10, add: { count: 1 } },
    { at: 25, add: { count: 1, orbitRadius: 4 } },
    { at: 45, add: { count: 1 } },
    { at: 70, add: { count: 1, orbitRadius: 4 } },
    { at: 100, add: { count: 1, duration: 1 } },
  ],
  cues: {
    icon: "book/wangdo",
    body: "atk-polygon",
    hit: "fx-spark",
    cast: "sfx.book.wangdo.cast",
    impact: "sfx.book.wangdo.hit",
  },
  evolution: {
    id: "elements",
    name: "유클리드 원론",
    requires: EVOLVE,
    kind: "wave",
    design:
      "The polygon becomes a circle: every 2 s a full ring shockwave expands to 96 px, hits everything once and pushes outward. Q.E.D. bursts on the ring spread to targets touching the proven one.",
  },
});

export const GRAPH_NOTE = book<BeamAttack>({
  id: "graph-note",
  name: "함수 그래프 노트",
  subject: "math",
  description: "모눈 위에 그린 사인 곡선이 종이를 뚫고 나간다. 정의역은 화면 끝까지다.",
  tool: "grid-ruler",
  base: BOOK_BASE_DAMAGE,
  attack: {
    kind: "beam",
    cooldown: 2.2,
    damage: 1.6,
    knock: 20,
    length: 160,
    width: 10,
    duration: 0.4,
    amplitude: 12,
    wavelength: 48,
    reflect: 0,
  },
  levels: [
    { at: 15, add: { length: 32 } },
    { at: 40, add: { width: 4, amplitude: 4 } },
    { at: 70, add: { damage: 0.4 } },
  ],
  cues: {
    icon: "book/graph",
    body: "atk-sine",
    hit: "fx-spark",
    cast: "sfx.book.graph-note.cast",
    impact: "sfx.book.graph-note.hit",
  },
  evolution: {
    id: "fourier",
    name: "푸리에 급수",
    requires: EVOLVE,
    kind: "beam",
    design:
      "Stacked harmonics: three beams fire together at wavelengths 48, 24 and 16 with amplitudes 12, 6 and 4. Where they cross, the hit counts twice for 증명 stacks.",
  },
});

// ── 물리 ────────────────────────────────────────────────────────────────────

export const HOLIDAY_PHYSICS = book<ProjectileAttack>({
  id: "holiday-physics",
  name: "홀리데이 일반물리",
  subject: "physics",
  description:
    "두껍고 무겁다. 던지면 포물선을 그린다. 이 책으로 배운 가장 확실한 물리는 이 책의 질량이다.",
  tool: "weight",
  base: BOOK_BASE_DAMAGE,
  attack: {
    kind: "projectile",
    cooldown: 1.8,
    damage: 2.2,
    knock: 180,
    count: 1,
    spread: 20,
    speed: 120,
    gravity: 400,
    range: 140,
    radius: 6,
    impactRadius: 20,
    pierce: 0,
    bounce: 0,
  },
  levels: [
    { at: 20, add: { count: 1 } },
    { at: 35, add: { knock: 40 } },
    { at: 60, add: { count: 1, impactRadius: 4 } },
  ],
  cues: {
    icon: "book/holiday-physics",
    body: "fx-book",
    hit: "fx-thud",
    cast: "sfx.book.holiday-physics.throw",
    impact: "sfx.book.holiday-physics.land",
  },
  evolution: {
    id: "principia",
    name: "프린키피아 사본",
    requires: EVOLVE,
    kind: "projectile",
    design:
      "The three laws. The tome flies straight with no gravity and never stops until a wall (first law), its knockback grows with its own mass of 3 (second), and every target it hits knocks it back the other way into the next (third): bounce 6 between monsters.",
  },
});

export const EM_LAB = book<ChainAttack>({
  id: "em-lab",
  name: "전자기 실습서",
  subject: "physics",
  description: "실습 시간에 아무도 접지를 하지 않았다. 그 결과가 이 책이다.",
  tool: "battery",
  base: BOOK_BASE_DAMAGE,
  attack: {
    kind: "chain",
    cooldown: 1.6,
    damage: 1.4,
    knock: 10,
    range: 120,
    jumps: 3,
    jumpRange: 56,
    falloff: 0.85,
  },
  levels: [
    { at: 15, add: { jumps: 1 } },
    { at: 40, add: { jumps: 1, jumpRange: 8 } },
    { at: 75, add: { jumps: 1 } },
  ],
  cues: {
    icon: "book/em-lab",
    body: "atk-lightning",
    hit: "fx-zap",
    cast: "sfx.book.em-lab.cast",
    impact: "sfx.book.em-lab.zap",
  },
  evolution: {
    id: "maxwell",
    name: "맥스웰 방정식",
    requires: EVOLVE,
    kind: "chain",
    design:
      "The current becomes a field: every struck target forks to two new ones instead of one, without falloff, and a target that is knocked back while charged deals collision damage as if 운동량 were full strength.",
  },
});

// ── 화학 ────────────────────────────────────────────────────────────────────

export const ZOOMIN_CHEM = book<ProjectileAttack>({
  id: "zoomin-chem",
  name: "줌인 일반화학",
  subject: "chemistry",
  description:
    "표지에 공학용 계산기 지참이라고 적혀 있다. 아무도 가져오지 않았다. 그래서 플라스크를 던진다.",
  tool: "pipette",
  base: BOOK_BASE_DAMAGE,
  attack: {
    kind: "projectile",
    cooldown: 2.6,
    damage: 0.6,
    knock: 10,
    count: 1,
    spread: 30,
    speed: 100,
    gravity: 360,
    range: 130,
    radius: 5,
    impactRadius: 14,
    pierce: 0,
    bounce: 0,
    poolRadius: 22,
    poolDuration: 3,
    poolTickInterval: 0.5,
    poolDamage: 0.35,
    poolStatus: { id: "acid", stacks: 1, chance: 1 },
  },
  levels: [
    { at: 20, add: { count: 1 } },
    { at: 50, add: { poolRadius: 4, poolDuration: 1 } },
    { at: 80, add: { count: 1 } },
  ],
  cues: {
    icon: "book/zoomin-chem",
    body: "atk-flask",
    hit: "fx-splash",
    area: "fx-acid-pool",
    cast: "sfx.book.zoomin-chem.throw",
    impact: "sfx.book.zoomin-chem.shatter",
  },
  evolution: {
    id: "aqua-regia",
    name: "왕수",
    requires: EVOLVE,
    kind: "projectile",
    design:
      "Aqua regia dissolves what acid cannot: every pool counts as 금속 + 산, so anything standing in it corrodes (방어 감소) whether or not it was metal, and pools that touch merge into one larger pool.",
  },
});

/** 가연 first, then the spark: on its own a weak burn, with the 반응 표 a 연소 every cast. */
export const LAB_REPORT = book<ConeAttack>({
  id: "lab-report",
  name: "실험 보고서",
  subject: "chemistry",
  description:
    "가설: 에탄올을 뿌리고 불을 붙이면 탄다. 결과: 탔다. 고찰: 오답이 타는 소리가 좋았다.",
  tool: "alcohol-lamp",
  base: BOOK_BASE_DAMAGE,
  attack: {
    kind: "cone",
    cooldown: 2,
    damage: 0.4,
    knock: 0,
    angle: 70,
    range: 56,
    hits: 1,
    duration: 0.15,
    status: { id: "flammable", stacks: 1, chance: 1 },
    followUp: { delay: 0.5, damage: 1, status: { id: "burn", stacks: 1, chance: 1 } },
  },
  levels: [
    { at: 25, add: { angle: 15 } },
    { at: 50, add: { range: 12 } },
    { at: 75, add: { damage: 0.2 } },
  ],
  cues: {
    icon: "book/lab-report",
    body: "atk-ethanol",
    hit: "fx-ignite",
    area: "fx-flame",
    cast: "sfx.book.lab-report.spray",
    impact: "sfx.book.lab-report.ignite",
  },
  evolution: {
    id: "thermite",
    name: "테르밋",
    requires: EVOLVE,
    kind: "cone",
    design:
      "The ignition is molten iron: the second stage leaves a 2 s burning line along the cone's centre that applies 불 and 금속 to everything crossing it, so acid 부식 follows.",
  },
});

// ── 생명 ────────────────────────────────────────────────────────────────────

export const CAMPING_BIO = book<SummonAttack>({
  id: "camping-bio",
  name: "캠핑 생명과학",
  subject: "biology",
  description:
    "야외 실습용이다. 펼치면 세포가 기어 나와 알아서 분열한다. 텐트 안에서는 펼치지 않는다.",
  tool: "microscope",
  base: BOOK_BASE_DAMAGE,
  attack: {
    kind: "summon",
    cooldown: 4,
    damage: 0.4,
    knock: 15,
    perCast: 1,
    cap: 4,
    speed: 70,
    radius: 5,
    lifetime: 12,
    hitInterval: 0.6,
    divideEvery: 4,
  },
  levels: [
    { at: 10, add: { cap: 1 } },
    { at: 30, add: { cap: 1 } },
    { at: 60, add: { cap: 2 } },
    { at: 90, add: { perCast: 1 } },
  ],
  cues: {
    icon: "book/camping-bio",
    body: "minion-cell",
    hit: "fx-spark",
    cast: "sfx.book.camping-bio.spawn",
    impact: "sfx.book.camping-bio.divide",
  },
  evolution: {
    id: "stem-cell",
    name: "줄기세포",
    requires: EVOLVE,
    kind: "summon",
    design:
      "Cells specialize by target when they divide: next to an elite or boss they become killer cells (×2 damage), next to a swarm they become splitters that pop for a 24 px burst, next to the owner at low HP they become healers.",
  },
});

export const DISSECTION = book<ConeAttack>({
  id: "dissection",
  name: "해부 실습서",
  subject: "biology",
  description: "개구리에게는 미안한 책이다. 오답에게는 하나도 미안하지 않다.",
  tool: "tweezers",
  base: BOOK_BASE_DAMAGE,
  attack: {
    kind: "cone",
    cooldown: 1.4,
    damage: 0.35,
    knock: 5,
    angle: 50,
    range: 44,
    hits: 4,
    duration: 0.3,
    status: { id: "bleed", stacks: 1, chance: 0.5 },
  },
  levels: [
    { at: 20, add: { hits: 1 } },
    { at: 45, add: { angle: 10 } },
    { at: 80, add: { hits: 2 } },
  ],
  cues: {
    icon: "book/dissection",
    body: "fx-slash",
    hit: "fx-spark",
    cast: "sfx.book.dissection.swish",
    impact: "sfx.book.dissection.cut",
  },
  evolution: {
    id: "precise-anatomy",
    name: "정밀 해부도",
    requires: EVOLVE,
    kind: "cone",
    design:
      "The scalpel knows the weak point: hits on a target with 5 or more 출혈 stacks always crit, and a bleeding target that dies passes half its stacks to the nearest monster.",
  },
});

// ── 지구과학 ────────────────────────────────────────────────────────────────

/** 예보 at 1.2 s: ×1.48 damage, ×1.18 length for a 지구과학 전공. */
export const ROUND_EARTH = book<TelegraphAttack>({
  id: "round-earth",
  name: "지구는 둥글다 지구과학",
  subject: "earth",
  description: "제목부터 단호하다. 바닥을 가리키면 잠시 뒤 단층이 갈라진다.",
  tool: "seismometer",
  base: BOOK_BASE_DAMAGE,
  attack: {
    kind: "telegraph",
    cooldown: 3,
    damage: 3,
    knock: 60,
    shape: "line",
    count: 1,
    range: 24,
    delay: 1.2,
    radius: 0,
    length: 120,
    width: 14,
    repeat: 0,
    repeatInterval: 0,
    status: { id: "slow", stacks: 1, chance: 1 },
  },
  levels: [
    { at: 25, add: { count: 1 } },
    { at: 50, add: { width: 4 } },
    { at: 80, add: { length: 40 } },
  ],
  cues: {
    icon: "book/round-earth",
    body: "fx-fault",
    hit: "fx-rubble",
    area: "fx-telegraph-line",
    cast: "sfx.book.round-earth.rumble",
    impact: "sfx.book.round-earth.crack",
  },
  evolution: {
    id: "plate-tectonics",
    name: "판 구조론",
    requires: EVOLVE,
    kind: "telegraph",
    design:
      "Faults stay open for 4 s as plate boundaries: monsters on either side are dragged toward the seam (pull 40 per tick) and take a second strike when the plates close.",
  },
});

/** One throw per cast, cycling 화성암 (불), 퇴적암 (둔화), 변성암 (방어 감소). */
export const ROCK_BOX = book<ProjectileAttack>({
  id: "rock-box",
  name: "암석 표본 상자",
  subject: "earth",
  description: "화성암, 퇴적암, 변성암 순서로 던진다. 순서를 바꾸면 선생님이 화낸다.",
  tool: "rock-hammer",
  base: BOOK_BASE_DAMAGE,
  attack: {
    kind: "projectile",
    cooldown: 1.2,
    damage: 1.3,
    knock: 50,
    count: 1,
    spread: 12,
    speed: 200,
    gravity: 0,
    range: 180,
    radius: 4,
    impactRadius: 0,
    pierce: 1,
    bounce: 0,
    status: [
      { id: "burn", stacks: 1, chance: 1 },
      { id: "slow", stacks: 1, chance: 1 },
      { id: "armorBreak", stacks: 1, chance: 1 },
    ],
  },
  levels: [
    { at: 15, add: { count: 1 } },
    { at: 40, add: { pierce: 1 } },
    { at: 70, add: { count: 1 } },
  ],
  cues: {
    icon: "book/rock-box",
    body: "atk-rock",
    hit: "fx-rubble",
    cast: "sfx.book.rock-box.throw",
    impact: "sfx.book.rock-box.crack",
  },
  evolution: {
    id: "rock-cycle",
    name: "암석의 순환",
    requires: EVOLVE,
    kind: "projectile",
    design:
      "Each rock turns into the next type when it hits and flies on to a new target, so one throw lands all three statuses; a rock that completes the cycle shatters into a 32 px burst.",
  },
});

export const BOOKS: readonly BookDef[] = [
  WANGDO,
  GRAPH_NOTE,
  HOLIDAY_PHYSICS,
  EM_LAB,
  ZOOMIN_CHEM,
  LAB_REPORT,
  CAMPING_BIO,
  DISSECTION,
  ROUND_EARTH,
  ROCK_BOX,
] as readonly BookDef[];

export function bookById(id: string): BookDef {
  const found = BOOKS.find((b) => b.id === id);
  if (!found) throw new Error(`unknown book ${id}`);
  return found;
}

export function toolById(id: string): ToolDef {
  const found = TOOLS.find((t) => t.id === id);
  if (!found) throw new Error(`unknown tool ${id}`);
  return found;
}
