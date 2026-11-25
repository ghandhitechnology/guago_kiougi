/**
 * The chat word filter (PLAN §12 "Moderation"). Text is turned into a skeleton of single letters
 * (Hangul split into jamo, Latin lower-cased with look-alikes and digits read as the letters they
 * stand for, punctuation and spacing dropped) and the word list is walked over it as a trie.
 *
 * Evasions it sees through: spaces or symbols between letters (시 발, f.u.c.k), repeated letters
 * and drawn-out vowels (시이이발, fuuuck), jamo typed one by one (ㅅㅣㅂㅏㄹ), tense or doubled
 * consonants (씨발, 씨빨 for 시발), digits and symbols for letters (ㅅ1발, sh1t, a$$), full-width
 * and accented letters, and Cyrillic look-alikes.
 *
 * What keeps ordinary words clean (the substring problem):
 * - A Korean entry matches whole syllables only: it starts on a syllable's first jamo and ends on
 *   its last, so 깃발 never reads as 시발 and 시바라 never as 시발.
 * - `jamo` entries (ㅅㅂ) match only jamo typed on their own, never jamo split out of syllables.
 * - A match that spans a space starts at the start of a word and ends at the end of one, or before
 *   a particle or suffix: 존 나 웃겨 is caught, 보존 나무 and 질병 신고 are not.
 * - `word` entries must be a whole word (or a word plus a particle or suffix) even without
 *   spaces: ass, but not class or assess.
 * - The `allow` list names real words that contain an entry (시발점, scunthorpe); a hit inside an
 *   allowed word is not a hit.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { chatGraphemes } from "@guago/shared";

export interface WordList {
  /** Matched anywhere inside a word, on syllable boundaries. */
  part?: string[];
  /** Matched only as a whole word, optionally followed by a particle or suffix. */
  word?: string[];
  /** Jamo abbreviations (ㅅㅂ), matched only where the jamo were typed on their own. */
  jamo?: string[];
  /** Real words that contain an entry; never masked. */
  allow?: string[];
}

export interface FilterResult {
  /** The text with every hit masked by `*`, one per character. */
  text: string;
  masked: boolean;
  /** The list entries that matched. */
  hits: string[];
}

export const WORDS_FILE = path.resolve(import.meta.dirname, "words.json");

// Skeleton -----------------------------------------------------------------------------------

const L = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const V = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
const T = " ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ";

/** Doubled and compound jamo as their parts, so ㅆ is ㅅㅅ and ㅘ is ㅗㅏ. */
const SPLIT: Record<string, string> = {
  ㄲ: "ㄱㄱ",
  ㄸ: "ㄷㄷ",
  ㅃ: "ㅂㅂ",
  ㅆ: "ㅅㅅ",
  ㅉ: "ㅈㅈ",
  ㄳ: "ㄱㅅ",
  ㄵ: "ㄴㅈ",
  ㄶ: "ㄴㅎ",
  ㄺ: "ㄹㄱ",
  ㄻ: "ㄹㅁ",
  ㄼ: "ㄹㅂ",
  ㄽ: "ㄹㅅ",
  ㄾ: "ㄹㅌ",
  ㄿ: "ㄹㅍ",
  ㅀ: "ㄹㅎ",
  ㅄ: "ㅂㅅ",
  ㅘ: "ㅗㅏ",
  ㅙ: "ㅗㅐ",
  ㅚ: "ㅗㅣ",
  ㅝ: "ㅜㅓ",
  ㅞ: "ㅜㅔ",
  ㅟ: "ㅜㅣ",
  ㅢ: "ㅡㅣ",
};

/** What a digit, symbol or letter may stand for, beyond itself. */
const STANDS_FOR: Record<string, readonly string[]> = {
  "0": ["o", "ㅇ"],
  "1": ["i", "l", "ㅣ"],
  "3": ["e"],
  "4": ["a"],
  "5": ["s"],
  "7": ["t"],
  "8": ["b"],
  "9": ["g"],
  "@": ["a"],
  $: ["s"],
  "!": ["i", "ㅣ"],
  "|": ["l", "i", "ㅣ"],
  "+": ["t"],
  i: ["i", "ㅣ"],
  l: ["l", "ㅣ"],
};

/** Cyrillic and other letters drawn like Latin ones. */
const LOOKALIKE: Record<string, string> = {
  а: "a",
  в: "b",
  е: "e",
  к: "k",
  м: "m",
  н: "h",
  о: "o",
  р: "p",
  с: "c",
  т: "t",
  у: "y",
  х: "x",
  і: "i",
  ј: "j",
  ѕ: "s",
  ı: "i",
};

/** Conjoining jamo (what NFKD gives for syllables and for typed jamo) as compatibility jamo. */
function jamoOf(code: number): string | undefined {
  if (code >= 0x1100 && code <= 0x1112) return L[code - 0x1100];
  if (code >= 0x1161 && code <= 0x1175) return V[code - 0x1161];
  if (code >= 0x11a8 && code <= 0x11c2) return T[code - 0x11a8 + 1];
  return undefined;
}

const isSyllable = (code: number) => code >= 0xac00 && code <= 0xd7a3;
const isCompatJamo = (code: number) => code >= 0x3131 && code <= 0x3163;
const LETTER = /\p{L}/u;
const WORD_CHAR = /[\p{L}\p{N}@$!|+]/u;
const MARK = /\p{M}/u;
const SPACE = /\s/u;

/** One letter of the skeleton. */
interface Sym {
  /** What it may be read as; a pattern letter matches any of them. */
  alts: readonly string[];
  /** May be passed over inside a match: a digit used as noise, a drawn-out vowel. */
  opt: boolean;
  /** Index of the code point it came from. */
  src: number;
  /** First and last letter of its syllable (or of its own code point). */
  first: boolean;
  last: boolean;
}

type Kind = "syllable" | "jamo" | "other";

export interface Skeleton {
  /** The text's code points. */
  cps: string[];
  kinds: Kind[];
  syms: Sym[];
  /** Per code point: index into `words`, or -1 between words. */
  word: number[];
  /** Code point ranges of the words, inclusive. */
  words: { from: number; to: number }[];
}

/** Breaks text into the letters the matcher walks over. Patterns go through the same steps. */
export function skeleton(text: string): Skeleton {
  const cps = Array.from(text);
  const kinds: Kind[] = [];
  const syms: Sym[] = [];
  const word: number[] = [];
  const words: { from: number; to: number }[] = [];
  /** The vowel the previous syllable ended on, for 시이이 as 시. */
  let openVowel: string | undefined;

  cps.forEach((cp, src) => {
    const code = cp.codePointAt(0) ?? 0;
    const inWord = WORD_CHAR.test(cp);
    if (inWord) {
      const prev = word[src - 1] ?? -1;
      const at = prev >= 0 ? prev : words.push({ from: src, to: src }) - 1;
      const range = words[at];
      if (range) range.to = src;
      word.push(at);
    } else word.push(-1);

    const parts = Array.from(cp.toLowerCase().normalize("NFKD")).filter((c) => !MARK.test(c));
    // Typed compatibility jamo are already the letters (NFKD would turn ㅄ into an archaic one).
    const jamo = isCompatJamo(code) ? [cp] : parts.map((c) => jamoOf(c.codePointAt(0) ?? 0));
    if (parts.length > 0 && jamo.every((j) => j !== undefined)) {
      const letters = Array.from(jamo.map((j) => SPLIT[j as string] ?? j).join(""));
      const syllable = isSyllable(code);
      kinds.push(syllable ? "syllable" : "jamo");
      const lastVowel = [...letters].reverse().find((c) => V.includes(c));
      // A syllable of ㅇ and the vowel just heard (시이, 바아) only draws the sound out.
      const drawnOut =
        syllable && letters.length === 2 && letters[0] === "ㅇ" && letters[1] === openVowel;
      letters.forEach((c, i) =>
        syms.push({
          alts: [c],
          opt: drawnOut,
          src,
          first: i === 0,
          last: i === letters.length - 1,
        }),
      );
      openVowel = syllable && V.includes(letters.at(-1) ?? "") ? lastVowel : undefined;
      return;
    }
    kinds.push("other");
    for (const part of parts) {
      const c = LOOKALIKE[part] ?? part;
      const stands = STANDS_FOR[c];
      if (LETTER.test(c)) {
        syms.push({ alts: stands ?? [c], opt: false, src, first: true, last: true });
        openVowel = undefined;
      } else if (stands) {
        syms.push({ alts: stands, opt: true, src, first: true, last: true });
      }
      // Anything else (spaces, punctuation, other digits, emoji) is not a letter and is skipped.
    }
  });
  return { cps, kinds, syms, word, words };
}

// Matching -----------------------------------------------------------------------------------

type Mode = "part" | "word" | "jamo";

interface Entry {
  text: string;
  mode: Mode;
}

interface TrieNode {
  id: number;
  next: Map<string, TrieNode>;
  ends: Entry[];
}

interface Hit {
  entry: Entry;
  /** Code point range, inclusive. */
  from: number;
  to: number;
}

/** What may follow a word entry inside the same word: Korean particles, English suffixes. */
const SUFFIXES = new Set([
  ..."이 가 은 는 을 를 아 야 들 도 만 의 한 게 냐 다 지 네 랑 아냐 이다 이야 이네 들아 같은 같이 새끼 놈 년".split(
    " ",
  ),
  ..."s es ed er ers ing in y ish".split(" "),
]);

/** Steps one message may spend walking, whatever its content. */
const STEP_BUDGET = 200_000;

function buildTrie(entries: Entry[]): TrieNode {
  let ids = 0;
  const root: TrieNode = { id: ids++, next: new Map(), ends: [] };
  for (const entry of entries) {
    const letters = skeleton(entry.text)
      .syms.filter((s) => !s.opt)
      .map((s) => s.alts[0] as string);
    if (letters.length === 0) continue;
    let node = root;
    for (const c of letters) {
      let child = node.next.get(c);
      if (!child) {
        child = { id: ids++, next: new Map(), ends: [] };
        node.next.set(c, child);
      }
      node = child;
    }
    node.ends.push(entry);
  }
  return root;
}

/** Every place an entry of the trie can be read in the skeleton, before placement rules. */
function walk(sk: Skeleton, root: TrieNode): Hit[] {
  const { syms } = sk;
  const hits: Hit[] = [];
  const seen = new Set<string>();
  let budget = STEP_BUDGET;

  const step = (i: number, node: TrieNode, prev: string, lastAt: number, start: number) => {
    if (--budget < 0) return;
    const key = `${i} ${node.id} ${prev} ${lastAt}`;
    if (seen.has(key)) return;
    seen.add(key);
    const end = syms[lastAt];
    const begin = syms[start];
    if (node.ends.length > 0 && end?.last && begin) {
      for (const entry of node.ends) hits.push({ entry, from: begin.src, to: end.src });
    }
    const s = syms[i];
    if (!s) return;
    for (const a of s.alts) {
      const child = node.next.get(a);
      if (child) step(i + 1, child, a, i, start);
    }
    // The letter just matched, again: fuuuck, ㅅㅅ in 씨.
    if (s.alts.includes(prev)) step(i + 1, node, prev, i, start);
    if (s.opt) step(i + 1, node, prev, lastAt, start);
  };

  syms.forEach((s, start) => {
    if (!s.first) return;
    seen.clear();
    for (const a of s.alts) {
      const child = root.next.get(a);
      if (child) step(start + 1, child, a, start, start);
    }
  });
  return hits;
}

const lettersIn = (sk: Skeleton, from: number, to: number) =>
  sk.cps
    .slice(from, to + 1)
    .filter((c) => LETTER.test(c))
    .join("")
    .toLowerCase();

/** The placement rules from the file comment. */
function placed(sk: Skeleton, hit: Hit): boolean {
  const { from, to } = hit;
  if (hit.entry.mode === "jamo") {
    for (let i = from; i <= to; i++) {
      if (LETTER.test(sk.cps[i] ?? "") && sk.kinds[i] !== "jamo") return false;
    }
    return true;
  }
  const first = sk.words[sk.word[from] ?? -1];
  const last = sk.words[sk.word[to] ?? -1];
  if (!first || !last) return false;
  if (hit.entry.mode === "part" && first === last) return true;
  if (lettersIn(sk, first.from, from - 1) !== "") return false;
  const rest = lettersIn(sk, to + 1, last.to);
  return rest === "" || SUFFIXES.has(rest);
}

export class ChatFilter {
  private words!: TrieNode;
  private allowed!: TrieNode;

  constructor(list: WordList) {
    this.replace(list);
  }

  static fromFile(file = WORDS_FILE): ChatFilter {
    return new ChatFilter(JSON.parse(readFileSync(file, "utf8")) as WordList);
  }

  /** Swaps the list in place; the admin tool calls this when the list is edited. */
  replace(list: WordList): void {
    const entries = (mode: Mode, texts: string[] = []) => texts.map((text) => ({ text, mode }));
    this.words = buildTrie([
      ...entries("part", list.part),
      ...entries("word", list.word),
      ...entries("jamo", list.jamo),
    ]);
    this.allowed = buildTrie(entries("part", list.allow));
  }

  check(text: string): FilterResult {
    const sk = skeleton(text);
    const allowed = walk(sk, this.allowed).filter((h) => placed(sk, h));
    const hits = walk(sk, this.words).filter(
      (h) => placed(sk, h) && !allowed.some((a) => a.from <= h.from && a.to >= h.to),
    );
    if (hits.length === 0) return { text, masked: false, hits: [] };

    const hidden = new Set<number>();
    for (const h of hits) {
      for (let i = h.from; i <= h.to; i++) if (!SPACE.test(sk.cps[i] ?? "")) hidden.add(i);
    }
    let cp = 0;
    let out = "";
    for (const { segment } of chatGraphemes(text)) {
      const size = Array.from(segment).length;
      let hide = false;
      for (let i = cp; i < cp + size; i++) if (hidden.has(i)) hide = true;
      out += hide ? "*" : segment;
      cp += size;
    }
    return { text: out, masked: true, hits: [...new Set(hits.map((h) => h.entry.text))] };
  }
}
