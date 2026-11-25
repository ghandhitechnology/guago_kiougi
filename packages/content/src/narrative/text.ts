/**
 * Measuring, wrapping and reading Korean copy without the art package: glyph advances of
 * Galmuri11 (the 12 px dialogue face, from its BDF), the dialogue box's real capacity, the
 * sentence endings that give a register away, and slot filling with the right particle.
 */
import type { Register, Slot } from "./schema.ts";

/**
 * The dialogue box in `packages/art/src/sheet/ui-screens.ts`: a 464 px page at x 8 whose text
 * starts at x 86 (margin 70 + 8) and must stop before the caret at x 454. Three ruled rows.
 */
export const DIALOGUE_BOX = { lines: 3, px: 364 } as const;
/** A toast: one row of an 11 px font across the 480 px screen, about 28 Hangul. */
export const TOAST_PX = 336;
/** Chat and system lines (PLAN §12: 120 characters per message). */
export const CHAT_CHARS = 120;
/** A 도감 field: about three rows of the codex page. */
export const CODEX_CHARS = 180;
/** Widest value a slot is assumed to take when measuring, in characters. */
export const SLOT_WIDTH: Readonly<Record<Slot, string>> = {
  player: "가나다라마바",
  monster: "오답노트골렘",
  count: "100",
  place: "리케이온산책로",
  item: "에너지드링크",
  npc: "리케이온서기",
  quest: "균열탐사기본실습",
  thesis: "넷째논제",
  award: "다먹었상",
  club: "동아리이름열자",
  time: "12월 31일 23시",
  total: "100",
  price: "1,234,567",
  reason: "채팅 규정 위반",
  level: "30",
  names: "가나다, 라마바, 사아자",
};

/** `{slot}` or `{slot|josa}`. */
const SLOT_RE = /\{(\w+)(?:\|([가-힣]+))?\}/g;

const HANGUL = (c: number) => (c >= 0xac00 && c <= 0xd7a3) || (c >= 0x3131 && c <= 0x318e);

/** Galmuri11 advances for ASCII 0x20 to 0x7e, in code order. */
const ASCII = [
  5, 4, 4, 8, 8, 10, 8, 4, 4, 4, 6, 8, 4, 6, 4, 6, 8, 6, 8, 8, 8, 8, 8, 8, 8, 8, 4, 4, 5, 6, 5, 6,
  10, 8, 8, 9, 8, 7, 7, 9, 8, 4, 7, 8, 7, 10, 8, 9, 8, 9, 8, 8, 8, 9, 8, 10, 8, 8, 7, 4, 6, 4, 6, 8,
  4, 7, 8, 7, 8, 8, 6, 8, 7, 4, 6, 7, 4, 10, 7, 8, 8, 8, 6, 7, 6, 8, 8, 10, 8, 8, 7, 5, 4, 5, 8,
];

/** Signs the font build includes beyond ASCII (`packages/art/src/fonts.ts`), with advances. */
const SIGNS: Readonly<Record<string, number>> = {
  "「": 5,
  "」": 5,
  "『": 6,
  "』": 6,
  "《": 8,
  "》": 8,
  "〈": 5,
  "〉": 5,
  "·": 4,
  "…": 12,
  "♪": 12,
  "★": 12,
  "☆": 12,
  "※": 12,
  "○": 12,
  "●": 12,
  "□": 12,
  "■": 12,
  "△": 12,
  "▲": 12,
  "▽": 12,
  "▼": 12,
  "◆": 12,
  "◇": 12,
  "→": 12,
  "←": 12,
  "↑": 12,
  "↓": 12,
  "−": 8,
  "×": 8,
  "÷": 8,
  "±": 8,
  "°": 5,
  "℃": 12,
  "≠": 12,
  "≤": 12,
  "≥": 12,
  "≈": 12,
  "∞": 12,
  "√": 12,
  π: 9,
  Σ: 8,
  Δ: 8,
  θ: 8,
  λ: 9,
  μ: 8,
  α: 9,
  β: 8,
  "²": 5,
  "³": 5,
  "½": 12,
};

/** Characters that read as machine-written or that the house style bans outright. */
const BANNED = /[—–“”‘’]/u;
const EMOJI = /\p{Extended_Pictographic}/u;

/** Advance of one character, or `undefined` when the font cannot draw it. */
function advance(ch: string): number | undefined {
  const c = ch.codePointAt(0) ?? 0;
  if (HANGUL(c)) return 12;
  if (c >= 0x20 && c <= 0x7e) return ASCII[c - 0x20];
  if (ch === "\n") return 0;
  return SIGNS[ch];
}

/** Characters in `text` the bundled font cannot draw or the style rules ban. */
export function badCharacters(text: string): string[] {
  const bad = new Set<string>();
  for (const ch of text) {
    if (BANNED.test(ch) || EMOJI.test(ch) || advance(ch) === undefined) bad.add(ch);
  }
  return [...bad];
}

/** Replaces `{slot}` and `{slot|josa}` with the widest value the slot is assumed to take. */
export function widest(text: string): string {
  return text.replace(SLOT_RE, (_, name: string, josa?: string) => {
    const value = SLOT_WIDTH[name as Slot] ?? "가나다라마바";
    return josa ? value + pickJosa(value, josa) : value;
  });
}

export function width(text: string): number {
  let w = 0;
  for (const ch of text) w += advance(ch) ?? 12;
  return w;
}

/** Greedy word wrap at spaces, the way BitmapText wraps; a word wider than a row breaks. */
export function wrap(text: string, px: number): string[] {
  const rows: string[] = [];
  for (const para of text.split("\n")) {
    let row = "";
    for (const word of para.split(" ")) {
      const next = row ? `${row} ${word}` : word;
      if (width(next) <= px) {
        row = next;
        continue;
      }
      if (row) rows.push(row);
      row = "";
      for (const ch of word) {
        if (width(row + ch) > px) {
          rows.push(row);
          row = "";
        }
        row += ch;
      }
    }
    rows.push(row);
  }
  return rows;
}

/** Rows the text takes in the dialogue box, slots at their widest. */
export function dialogueRows(text: string): number {
  return wrap(widest(text), DIALOGUE_BOX.px).length;
}

// Registers ---------------------------------------------------------------------------------

export type Family = "polite" | "plain" | "hage" | "none";

export function family(register: Register): Family {
  if (register === "hapsyo" || register === "haeyo") return "polite";
  if (register === "banmal") return "plain";
  return register;
}

/** Last syllables that end a 반말 sentence and never a 존댓말 one. */
const PLAIN_END = new Set("야어아지냐니래해돼줘봐와써자라다까걸군든".split(""));
/** Plain endings a 하게체 speaker would not use either. */
const HAGE_SLIP = new Set("야어냐니".split(""));

/** Sentences of a line with quotes, slots and trailing marks removed. */
export function sentences(text: string): string[] {
  const bare = text
    .replace(/「[^」]*」|『[^』]*』/g, "")
    .replace(SLOT_RE, "")
    .replace(/\([^)]*\)/g, "");
  return bare
    .split(/(?<=[.?!…])\s+|\n/)
    .map((s) => s.replace(/[\s.?!…~,]+$/u, "").trim())
    .filter((s) => s.length > 0);
}

/**
 * What a sentence's ending says about its register: `polite` for -요, -니다, -니까, -시오;
 * `plain` for a 반말 ending; `null` when the sentence ends in a noun, a name or a number and
 * gives nothing away.
 */
export function ending(sentence: string): "polite" | "plain" | null {
  const chars = [...sentence];
  const last = chars.at(-1) ?? "";
  const before = chars.at(-2) ?? "";
  if (last === "요" || last === "죠") return "polite";
  // -ㅂ니다, -습니까: the syllable before 니 closes on ㅂ. 없으니까 (because) is plain.
  const third = chars.at(-3) ?? "";
  if ((last === "다" || last === "까") && before === "니" && finalOf(third) === 17) return "polite";
  if (last === "오" && before === "시") return "polite";
  if (PLAIN_END.has(last)) return "plain";
  return null;
}

/** Sentences in `text` that break the speaker's register. */
export function registerSlips(text: string, register: Register): string[] {
  const fam = family(register);
  if (fam === "none") return [];
  return sentences(text).filter((s) => {
    const end = ending(s);
    if (fam === "polite") return end === "plain";
    if (end === "polite") return true;
    return fam === "hage" && HAGE_SLIP.has([...s].at(-1) ?? "");
  });
}

// Slots -------------------------------------------------------------------------------------

/** Particle pairs: the first follows a final consonant, the second a vowel. */
const JOSA: readonly (readonly [string, string])[] = [
  ["을", "를"],
  ["이", "가"],
  ["은", "는"],
  ["과", "와"],
  ["으로", "로"],
  ["이랑", "랑"],
];

export function knownJosa(josa: string): boolean {
  return JOSA.some((pair) => pair.includes(josa));
}

/** Final consonant index of one syllable (0 for none, 8 ㄹ, 17 ㅂ), or -1 for anything else. */
function finalOf(syllable: string): number {
  const c = syllable.codePointAt(0) ?? 0;
  return c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 : -1;
}

/** Final consonant index of a word, or of a digit read aloud (0 영, 1 일, 3 삼 …). */
function batchim(value: string): number {
  const last = [...value.replace(/[^가-힣0-9]+$/u, "")].at(-1) ?? "";
  if (finalOf(last) >= 0) return finalOf(last);
  const digit = "0123456789".indexOf(last);
  if (digit >= 0) return [21, 8, 0, 16, 0, 0, 1, 8, 8, 0][digit] ?? 0;
  return 0;
}

export function pickJosa(value: string, josa: string): string {
  const pair = JOSA.find((p) => p.includes(josa));
  if (!pair) return josa;
  const fin = batchim(value);
  // ㄹ takes 로, never 으로.
  if (pair[0] === "으로") return fin === 0 || fin === 8 ? "로" : "으로";
  return fin === 0 ? pair[1] : pair[0];
}

export interface SlotUse {
  readonly name: string;
  readonly josa?: string;
}

export function slotsIn(text: string): SlotUse[] {
  return [...text.matchAll(SLOT_RE)].map((m) =>
    m[2] ? { name: m[1] ?? "", josa: m[2] } : { name: m[1] ?? "" },
  );
}

/** Fills slots, picking each particle by the filled word's last syllable. */
export function fill(text: string, values: Partial<Record<Slot, string | number>>): string {
  return text.replace(SLOT_RE, (whole, name: string, josa?: string) => {
    const v = values[name as Slot];
    if (v === undefined) return whole;
    const s = String(v);
    return josa ? s + pickJosa(s, josa) : s;
  });
}
