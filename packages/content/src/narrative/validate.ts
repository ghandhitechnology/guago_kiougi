/**
 * Checks the narrative data before anything reads it: every key exists and is used, every line
 * has a known speaker and face, fits its box, keeps its speaker's register, uses only glyphs the
 * font has, and every scene points at things that exist. Returns problems; empty means clean.
 */
import {
  type Cutscene,
  EFFECTS,
  FIGHT_CUES,
  type Line,
  MILESTONES,
  MUSIC,
  type Narrative,
  PROMPTS,
  type Register,
  SLOTS,
  SOUND_CUES,
  type Speaker,
  type Step,
  type TextKey,
} from "./schema.ts";
import {
  badCharacters,
  CHAT_CHARS,
  CODEX_CHARS,
  DIALOGUE_BOX,
  dialogueRows,
  knownJosa,
  registerSlips,
  slotsIn,
  widest,
} from "./text.ts";

export interface Problem {
  readonly where: string;
  readonly message: string;
}

type Limit = "dialogue" | "row" | "chat" | "codex" | "none";

export function validateNarrative(n: Narrative): Problem[] {
  const problems: Problem[] = [];
  const report = (where: string, message: string) => problems.push({ where, message });
  const used = new Set<TextKey>();
  const speakers = new Map<string, Speaker>();
  for (const s of n.speakers) {
    if (speakers.has(s.id)) report(`speaker ${s.id}`, "speaker id is defined twice");
    speakers.set(s.id, s);
  }
  const systemIds = new Set(n.system.map((m) => m.id));
  const cutsceneIds = new Set(n.cutscenes.map((c) => c.id));
  const announceIds = new Set(n.announcements.map((m) => m.id));
  const milestones: readonly string[] = MILESTONES;
  const playerRegister = speakers.get("player")?.register ?? "haeyo";

  /** One piece of text: key, glyphs, slots, length, and register when someone says it. */
  const text = (
    where: string,
    key: TextKey | undefined,
    opts: { limit: Limit; slots?: readonly string[]; register?: Register },
  ) => {
    if (key === undefined) return;
    used.add(key);
    const value = n.ko[key];
    if (value === undefined) {
      report(where, `missing text for key ${key}`);
      return;
    }
    if (value.trim() === "") report(where, `empty text for key ${key}`);
    if (/TODO|lorem|TBD/i.test(value)) report(where, `placeholder text in ${key}: ${value}`);
    const bad = badCharacters(value);
    if (bad.length > 0)
      report(where, `${key} has characters the font or the style rules refuse: ${bad.join(" ")}`);
    for (const slot of slotsIn(value)) {
      if (!(opts.slots ?? ["player"]).includes(slot.name))
        report(where, `${key} uses slot {${slot.name}} which is not filled here`);
      if (slot.josa && !knownJosa(slot.josa))
        report(where, `${key} uses unknown particle ${slot.josa}`);
    }
    if (opts.limit === "dialogue" && dialogueRows(value) > DIALOGUE_BOX.lines)
      report(
        where,
        `${key} takes ${dialogueRows(value)} rows; the dialogue box holds ${DIALOGUE_BOX.lines}`,
      );
    if (opts.limit === "row" && dialogueRows(value) > 1)
      report(where, `${key} takes ${dialogueRows(value)} rows; it must fit one`);
    if (opts.limit === "chat" && [...widest(value)].length > CHAT_CHARS)
      report(where, `${key} is longer than ${CHAT_CHARS} characters`);
    if (opts.limit === "codex" && [...value].length > CODEX_CHARS)
      report(where, `${key} is longer than ${CODEX_CHARS} characters`);
    if (opts.register) {
      for (const s of registerSlips(value, opts.register))
        report(where, `${key} breaks the ${opts.register} register: "${s}"`);
    }
  };

  const speakerOf = (where: string, id: string): Speaker | undefined => {
    const s = speakers.get(id);
    if (!s) report(where, `unknown speaker ${id}`);
    return s;
  };

  const line = (where: string, l: Line, limit: Limit = "dialogue") => {
    const s = speakerOf(where, l.speaker);
    if (s && l.face !== undefined && !s.faces.includes(l.face))
      report(where, `${l.speaker} has no face ${l.face}`);
    text(where, l.text, s ? { limit, register: s.register } : { limit });
    for (const [i, o] of (l.choice ?? []).entries()) {
      text(`${where} option ${i + 1}`, o.text, { limit: "row", register: playerRegister });
      for (const r of o.reply) line(`${where} option ${i + 1}`, r, limit);
    }
  };

  // Speakers.
  for (const s of n.speakers) {
    const where = `speaker ${s.id}`;
    text(where, s.name, { limit: "row" });
    if (s.samples.length !== 3) report(where, `needs three samples, has ${s.samples.length}`);
    for (const k of s.samples) text(where, k, { limit: "dialogue", register: s.register });
    text(where, s.donkatsu, { limit: "dialogue", register: s.register });
    if (s.actor && !speakers.has(s.actor) && s.actor !== s.id)
      report(where, `actor ${s.actor} is not a speaker`);
  }

  // Scenes.
  const actorOf = (id: string) => speakers.get(id)?.actor ?? id;
  const steps = (where: string, scene: Pick<Cutscene, "cast" | "marks">, list: readonly Step[]) => {
    const onStage = (actor: string, at: string) => {
      if (!scene.cast.includes(actorOf(actor))) report(at, `${actor} is not in the cast`);
    };
    const spot = (mark: string, at: string) => {
      if (!scene.marks.includes(mark) && !scene.cast.includes(mark))
        report(at, `${mark} is neither a mark nor an actor of the scene`);
    };
    for (const [i, s] of list.entries()) {
      const at = `${where} step ${i + 1}`;
      switch (s.do) {
        case "say":
          line(at, s.line);
          break;
        case "bubble":
          onStage(s.line.speaker, at);
          line(at, s.line);
          break;
        case "camera":
          spot(s.to, at);
          break;
        case "move":
          onStage(s.actor, at);
          spot(s.to, at);
          break;
        case "face":
        case "anim":
          onStage(s.actor, at);
          break;
        case "fx":
          if (!(EFFECTS as readonly string[]).includes(s.fx)) report(at, `unknown effect ${s.fx}`);
          if (s.at) spot(s.at, at);
          break;
        case "sound":
          if (!(SOUND_CUES as readonly string[]).includes(s.cue))
            report(at, `unknown sound ${s.cue}`);
          break;
        case "music":
          if (s.track !== null && !(MUSIC as readonly string[]).includes(s.track))
            report(at, `unknown music ${s.track}`);
          break;
        case "show":
          text(at, s.doc.title, { limit: "row" });
          for (const r of s.doc.rows) text(at, r.text, { limit: "row" });
          break;
        case "system":
          if (!systemIds.has(s.message)) report(at, `unknown system message ${s.message}`);
          break;
        case "play":
          if (!/^[a-z-]+(:[a-z0-9-]+)?$/.test(s.until))
            report(at, `malformed condition ${s.until}`);
          if (s.prompt && !(PROMPTS as readonly string[]).includes(s.prompt))
            report(at, `unknown prompt ${s.prompt}`);
          if (s.at) spot(s.at, at);
          break;
        case "offer":
          spot(s.at, at);
          for (const l of s.lines) line(at, l);
          break;
        case "title":
          for (const k of s.lines) text(at, k, { limit: "row" });
          break;
        case "wait":
          break;
      }
    }
  };

  const seen = new Set<string>();
  const unique = (kind: string, id: string) => {
    if (seen.has(`${kind}:${id}`)) report(`${kind} ${id}`, "id is used twice");
    seen.add(`${kind}:${id}`);
  };

  for (const b of n.opening) {
    unique("opening", b.id);
    steps(`opening ${b.id}`, b.scene, b.scene.steps);
  }
  for (const c of n.cutscenes) {
    unique("cutscene", c.id);
    steps(`cutscene ${c.id}`, c, c.steps);
  }

  // Story.
  for (const b of n.story) {
    const where = `story ${b.id}`;
    unique("story", b.id);
    if (!milestones.includes(b.after)) report(where, `unknown milestone ${b.after}`);
    text(where, b.title, { limit: "row" });
    if (b.lines) steps(where, { cast: [], marks: [] }, b.lines);
    if (b.cutscene && !cutsceneIds.has(b.cutscene)) report(where, `unknown cutscene ${b.cutscene}`);
    for (const a of b.announce ?? [])
      if (!announceIds.has(a)) report(where, `unknown announcement ${a}`);
  }
  for (const b of n.bosses) {
    const where = `boss ${b.boss}`;
    unique("boss", b.boss);
    speakerOf(where, b.boss);
    if (!cutsceneIds.has(b.freed)) report(where, `unknown cutscene ${b.freed}`);
    for (const k of b.theses ?? []) text(where, k, { limit: "row" });
    for (const f of b.fight) {
      if (!(FIGHT_CUES as readonly string[]).includes(f.on)) report(where, `unknown cue ${f.on}`);
      if (f.phase !== undefined && (f.phase < 1 || f.phase > (b.theses?.length ?? 1)))
        report(where, `cue ${f.on} names phase ${f.phase}, which the boss does not have`);
      for (const l of f.lines) line(`${where} on ${f.on}`, l);
    }
  }

  // 도감.
  for (const e of n.codex) {
    const where = `codex ${e.id}`;
    unique("codex", e.id);
    text(where, e.name, { limit: "row" });
    const fields =
      e.section === "scientist"
        ? [e.era, e.who, e.right, e.wrong, e.replaced]
        : e.section === "book"
          ? [e.flavor, e.concept]
          : [e.body];
    for (const k of fields) text(where, k, { limit: "codex" });
    if (e.section !== "school" && e.section !== "misconception" && e.sources.length === 0)
      report(where, "a science claim needs at least one source");
    for (const url of e.sources)
      if (!url.startsWith("https://")) report(where, `source is not a https URL: ${url}`);
  }

  // Hub.
  for (const [i, b] of n.barks.entries()) {
    const where = `bark ${i + 1} (${b.speaker})`;
    const s = speakerOf(where, b.speaker);
    text(where, b.text, s ? { limit: "dialogue", register: s.register } : { limit: "dialogue" });
    if (!milestones.includes(b.from)) report(where, `unknown milestone ${b.from}`);
    if (b.until && milestones.indexOf(b.until) <= milestones.indexOf(b.from))
      report(where, `until ${b.until} does not come after ${b.from}`);
  }
  for (const d of n.descriptions) {
    const where = `description ${d.id}`;
    unique(`description-${d.kind}`, d.id);
    text(where, d.name, { limit: "row" });
    text(where, d.desc, { limit: "dialogue" });
  }
  for (const t of n.terms ?? []) {
    unique(`term-${t.kind}`, t.id);
    text(`term ${t.kind} ${t.id}`, t.name, { limit: "row" });
  }
  for (const q of n.quests) {
    const where = `quest ${q.id}`;
    unique("quest", q.id);
    const voice = q.voice ? speakerOf(where, q.voice) : undefined;
    for (const slot of q.slots)
      if (!(SLOTS as readonly string[]).includes(slot)) report(where, `unknown slot ${slot}`);
    if (q.from && !milestones.includes(q.from)) report(where, `unknown milestone ${q.from}`);
    text(where, q.poster, { limit: "row" });
    text(where, q.title, { limit: "row", slots: q.slots });
    text(
      where,
      q.body,
      voice
        ? { limit: "dialogue", slots: q.slots, register: voice.register }
        : { limit: "dialogue", slots: q.slots },
    );
  }
  for (const m of [...n.system, ...n.announcements]) {
    const where = `message ${m.id}`;
    unique("message", m.id);
    const s = speakerOf(where, m.voice);
    const limit: Limit = m.channel === "dialogue" ? "dialogue" : "chat";
    text(
      where,
      m.text,
      s ? { limit, slots: m.slots, register: s.register } : { limit, slots: m.slots },
    );
  }
  const principal = speakers.get("principal");
  for (const a of n.awards) {
    const where = `award ${a.id}`;
    unique("award", a.id);
    text(where, a.title, { limit: "row" });
    text(
      where,
      a.citation,
      principal ? { limit: "dialogue", register: principal.register } : { limit: "dialogue" },
    );
  }
  text("award frame", n.awardFrame.heading, { limit: "row" });
  text("award frame", n.awardFrame.signature, { limit: "row" });
  for (const e of n.eggs) {
    unique("egg", e.id);
    for (const k of e.texts) if (!used.has(k)) text(`egg ${e.id}`, k, { limit: "dialogue" });
  }

  // Keys nothing points at.
  for (const key of Object.keys(n.ko))
    if (!used.has(key)) report(`text ${key}`, "no data refers to this key");

  return problems;
}
