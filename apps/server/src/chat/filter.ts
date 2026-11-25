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
 *
 * Cost is linear in the text: runs of one letter longer than three are folded into the third, a
 * match may span at most `MAX_SPAN` letters, each start position is walked once per trie state,
 * and everything (walk, placement checks) draws on one step budget. Running out of it fails
 * closed: the result is `unreadable`, never a silent pass.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { chatGraphemes, compatJamo, JAMO_VOWELS as V } from "@guago/shared";

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
  /**
   * The walk ran out of its step budget. The text was not fully read, so it must not be
   * delivered as clean; the room refuses it.
   */
  unreadable: boolean;
}

export const WORDS_FILE = path.resolve(import.meta.dirname, "words.json");

// Skeleton -----------------------------------------------------------------------------------

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

const isSyllable = (code: number) => code >= 0xac00 && code <= 0xd7a3;
const isCompatJamo = (code: number) => code >= 0x3131 && code <= 0x3163;
const LETTER = /\p{L}/u;
const INVISIBLE = /\p{Default_Ignorable_Code_Point}/u;
// Invisible characters count as part of the word around them, so they never split one.
const WORD_CHAR = /[\p{L}\p{N}\p{Default_Ignorable_Code_Point}@$!|+]/u;
const MARK = /\p{M}/u;
const SPACE = /\s/u;

/** Letters of one run kept apart; the rest of the run folds into the last kept one. */
const MAX_RUN = 3;
/** Letters one match may span, gaps and repeats included. */
const MAX_SPAN = 32;
/** Steps one message may spend, walk and placement together. */
const STEP_BUDGET = 60_000;
/** Longest particle or suffix after a word entry, in letters. */
const MAX_SUFFIX = 3;

/** One letter of the skeleton. */
interface Sym {
  /** What it may be read as; a pattern letter matches any of them. */
  alts: readonly string[];
  /** May be passed over inside a match: a digit used as noise, a drawn-out vowel. */
  opt: boolean;
  /** Code points it covers (more than one when a run was folded into it). */
  src: number;
  end: number;
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
  /** `letters[i]`: letters (\p{L}) among code points before i; `foreign[i]` likewise for letters
   * that are not typed jamo. */
  letters: number[];
  foreign: number[];
  /** Code point index of each letter, in order. */
  letterAt: number[];
}

/** Breaks text into the letters the matcher walks over. Patterns go through the same steps. */
export function skeleton(text: string): Skeleton {
  const cps = Array.from(text);
  const kinds: Kind[] = [];
  const syms: Sym[] = [];
  const word: number[] = [];
  const words: { from: number; to: number }[] = [];
  const letters = [0];
  const foreign = [0];
  const letterAt: number[] = [];
  /** The vowel the previous syllable ended on, for 시이이 as 시. */
  let openVowel: string | undefined;

  const push = (s: Sym) => {
    const n = syms.length;
    const key = s.alts.join();
    let run = 0;
    while (
      run < MAX_RUN &&
      syms[n - 1 - run]?.alts.join() === key &&
      syms[n - 1 - run]?.opt === s.opt
    )
      run++;
    const prev = syms[n - 1];
    if (run === MAX_RUN && prev) {
      prev.end = s.end;
      prev.last ||= s.last;
    } else syms.push(s);
  };

  cps.forEach((cp, src) => {
    const code = cp.codePointAt(0) ?? 0;
    if (WORD_CHAR.test(cp)) {
      const prev = word[src - 1] ?? -1;
      const at = prev >= 0 ? prev : words.push({ from: src, to: src }) - 1;
      const range = words[at];
      if (range) range.to = src;
      word.push(at);
    } else word.push(-1);

    const kind = classify(cp, code, src);
    kinds.push(kind);
    const isLetter = LETTER.test(cp) && !INVISIBLE.test(cp);
    letters.push((letters[src] ?? 0) + (isLetter ? 1 : 0));
    foreign.push((foreign[src] ?? 0) + (isLetter && kind !== "jamo" ? 1 : 0));
    if (isLetter) letterAt.push(src);
  });

  function classify(cp: string, code: number, src: number): Kind {
    // Hangul fillers and zero-width characters are not letters and do not break the word.
    if (INVISIBLE.test(cp)) return "other";
    const parts = Array.from(cp.toLowerCase().normalize("NFKD")).filter((c) => !MARK.test(c));
    // Typed compatibility jamo are already the letters (NFKD would turn ㅄ into an archaic one).
    const jamo = isCompatJamo(code) ? [cp] : parts.map((c) => compatJamo(c.codePointAt(0) ?? 0));
    if (parts.length > 0 && jamo.every((j) => j !== undefined)) {
      const split = Array.from(jamo.map((j) => SPLIT[j as string] ?? j).join(""));
      const syllable = isSyllable(code);
      const lastVowel = [...split].reverse().find((c) => V.includes(c));
      // A syllable of ㅇ and the vowel just heard (시이, 바아) only draws the sound out.
      const drawnOut =
        syllable && split.length === 2 && split[0] === "ㅇ" && split[1] === openVowel;
      split.forEach((c, i) => {
        push({
          alts: [c],
          opt: drawnOut,
          src,
          end: src,
          first: i === 0,
          last: i === split.length - 1,
        });
      });
      openVowel = syllable && V.includes(split.at(-1) ?? "") ? lastVowel : undefined;
      return syllable ? "syllable" : "jamo";
    }
    for (const part of parts) {
      const c = LOOKALIKE[part] ?? part;
      const stands = STANDS_FOR[c];
      if (LETTER.test(c)) {
        push({ alts: stands ?? [c], opt: false, src, end: src, first: true, last: true });
        openVowel = undefined;
      } else if (stands) {
        push({ alts: stands, opt: true, src, end: src, first: true, last: true });
      }
      // Anything else (spaces, punctuation, other digits, emoji) is not a letter and is skipped.
    }
    return "other";
  }

  return { cps, kinds, syms, word, words, letters, foreign, letterAt };
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

/** Steps left for one `check`. */
interface Budget {
  left: number;
}

/**
 * Every distinct place an entry of the trie can be read in the skeleton, before placement rules.
 * Returns undefined when the budget ran out.
 */
function walk(sk: Skeleton, root: TrieNode, budget: Budget): Hit[] | undefined {
  const { syms } = sk;
  const hits = new Map<string, Hit>();
  const seen = new Set<string>();

  // `i` is the next letter to read; `prev` the pattern letter just matched.
  const step = (i: number, node: TrieNode, prev: string, start: number): boolean => {
    if (--budget.left < 0) return false;
    const key = `${i} ${node.id} ${prev}`;
    if (seen.has(key)) return true;
    seen.add(key);
    const s = syms[i];
    if (!s || i - start >= MAX_SPAN) return true;
    const consume = (into: TrieNode, letter: string): boolean => {
      if (s.last) {
        const from = syms[start]?.src ?? 0;
        for (const entry of into.ends) {
          hits.set(`${entry.mode} ${entry.text} ${from} ${s.end}`, { entry, from, to: s.end });
        }
      }
      return step(i + 1, into, letter, start);
    };
    for (const a of s.alts) {
      const child = node.next.get(a);
      if (child && !consume(child, a)) return false;
    }
    // The letter just matched, again: fuuuck, ㅅㅅ in 씨.
    if (s.alts.includes(prev) && !consume(node, prev)) return false;
    if (s.opt && !step(i + 1, node, prev, start)) return false;
    return true;
  };

  for (let start = 0; start < syms.length; start++) {
    const s = syms[start];
    if (!s?.first) continue;
    seen.clear();
    for (const a of s.alts) {
      const child = root.next.get(a);
      if (!child) continue;
      if (s.last) {
        for (const entry of child.ends) {
          hits.set(`${entry.mode} ${entry.text} ${s.src} ${s.end}`, {
            entry,
            from: s.src,
            to: s.end,
          });
        }
      }
      if (!step(start + 1, child, a, start)) return undefined;
    }
  }
  return [...hits.values()];
}

/** The letters (\p{L}) in a code point range, or undefined when there are more than `max`. */
function lettersIn(sk: Skeleton, from: number, to: number, max: number): string | undefined {
  const a = sk.letters[from] ?? 0;
  const b = sk.letters[to + 1] ?? a;
  if (b - a > max) return undefined;
  let out = "";
  for (let k = a; k < b; k++) out += sk.cps[sk.letterAt[k] ?? 0] ?? "";
  return out.toLowerCase();
}

/** The placement rules from the file comment. Constant time per hit. */
function placed(sk: Skeleton, hit: Hit): boolean {
  const { from, to } = hit;
  if (hit.entry.mode === "jamo") return (sk.foreign[to + 1] ?? 0) === (sk.foreign[from] ?? 0);
  const first = sk.words[sk.word[from] ?? -1];
  const last = sk.words[sk.word[to] ?? -1];
  if (!first || !last) return false;
  if (hit.entry.mode === "part" && first === last) return true;
  if (lettersIn(sk, first.from, from - 1, 0) !== "") return false;
  const rest = lettersIn(sk, to + 1, last.to, MAX_SUFFIX);
  return rest === "" || (rest !== undefined && SUFFIXES.has(rest));
}

export class ChatFilter {
  private words!: TrieNode;
  private allowed!: TrieNode;
  private readonly budget: number;

  /** `budget` is the step budget per message; only tests change it. */
  constructor(list: WordList, budget = STEP_BUDGET) {
    this.budget = budget;
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
    const unreadable = { text, masked: false, hits: [], unreadable: true };
    const budget = { left: this.budget };
    const sk = skeleton(text);
    const allowedRaw = walk(sk, this.allowed, budget);
    const found = allowedRaw && walk(sk, this.words, budget);
    if (!allowedRaw || !found) return unreadable;
    budget.left -= allowedRaw.length + found.length;
    const allowed = allowedRaw.filter((h) => placed(sk, h));
    const hits: Hit[] = [];
    for (const h of found) {
      budget.left -= allowed.length;
      if (placed(sk, h) && !allowed.some((a) => a.from <= h.from && a.to >= h.to)) hits.push(h);
    }
    if (budget.left < 0) return unreadable;
    if (hits.length === 0) return { text, masked: false, hits: [], unreadable: false };

    // Union of the hit ranges, then one pass over the text.
    const ranges = hits.map((h) => [h.from, h.to] as const).sort((a, b) => a[0] - b[0]);
    const hidden = new Uint8Array(sk.cps.length);
    let reach = -1;
    for (const [from, to] of ranges) {
      for (let i = Math.max(from, reach + 1); i <= to; i++) {
        if (!SPACE.test(sk.cps[i] ?? "")) hidden[i] = 1;
      }
      reach = Math.max(reach, to);
    }
    let cp = 0;
    let out = "";
    for (const { segment } of chatGraphemes(text)) {
      const size = Array.from(segment).length;
      let hide = false;
      for (let i = cp; i < cp + size; i++) if (hidden[i]) hide = true;
      out += hide ? "*" : segment;
      cp += size;
    }
    return {
      text: out,
      masked: true,
      hits: [...new Set(hits.map((h) => h.entry.text))],
      unreadable: false,
    };
  }
}
