/**
 * Renders the narrative as plain text to read top to bottom, the way the art lane has a contact
 * sheet. `node packages/content/src/narrative/print.ts <part>` prints one part:
 * voices, opening, story, cutscenes, codex, hub, quests, system.
 */
import { NARRATIVE as N } from "./index.ts";
import type { Cutscene, Line, Step } from "./schema.ts";

/** The content package has no Node types; this script runs under Node only. */
declare const process: { readonly argv: readonly string[] };
declare const console: { log(text: string): void };

const ko = (key: string | undefined) => (key === undefined ? "" : (N.ko[key] ?? `?${key}`));
const nameOf = (id: string) => ko(N.speakers.find((s) => s.id === id)?.name) || id;

function line(l: Line, indent = ""): string[] {
  const face = l.face ? ` (${l.face})` : "";
  const out = [`${indent}${nameOf(l.speaker)}${face}: ${ko(l.text)}`];
  for (const o of l.choice ?? []) {
    out.push(`${indent}  ▸ ${ko(o.text)}`);
    for (const r of o.reply) out.push(...line(r, `${indent}      `));
  }
  return out;
}

function step(s: Step): string[] {
  switch (s.do) {
    case "say":
      return line(s.line);
    case "bubble":
      return line(s.line).map((t) => `(말풍선) ${t}`);
    case "camera":
      return [`  [카메라 → ${s.to}]`];
    case "move":
      return [`  [${s.actor} → ${s.to}]`];
    case "face":
      return [`  [${s.actor} 바라봄 ${s.dir}]`];
    case "anim":
      return [`  [${s.actor}: ${s.anim}]`];
    case "fx":
      return [`  [효과 ${s.fx}${s.at ? ` @ ${s.at}` : ""}]`];
    case "sound":
      return [`  [소리 ${s.cue}]`];
    case "music":
      return [`  [음악 ${s.track ?? "끔"}]`];
    case "wait":
      return [`  [${s.ms}ms]`];
    case "show":
      return [
        `  ┌ ${ko(s.doc.title)}`,
        ...s.doc.rows.map(
          (r) => `  │ ${ko(r.text)}${r.hand && r.hand !== "student" ? `   ‹${r.hand}›` : ""}`,
        ),
        "  └",
      ];
    case "system": {
      const m = N.system.find((x) => x.id === s.message);
      return [`  《${m ? nameOf(m.voice) : "시스템"}》 ${ko(m?.text)}`];
    }
    case "play":
      return [
        `  ▶ 플레이: ${s.until}${s.prompt ? ` · 아이콘 ${s.prompt}${s.at ? ` @ ${s.at}` : ""}` : ""}`,
      ];
    case "offer":
      return [`  ◇ 선택 대화 @ ${s.at}`, ...s.lines.flatMap((l) => line(l, "    "))];
    case "title":
      return s.lines.map((k) => `  ═══ ${ko(k)} ═══`);
  }
}

const scene = (c: Cutscene) => [`  (map ${c.map})`, ...c.steps.flatMap(step)];

function voices(): string[] {
  return N.speakers.flatMap((s) => [
    `■ ${ko(s.name)}  [${s.register}]`,
    `  ${s.role}`,
    ...s.samples.map((k) => `  · ${ko(k)}`),
    `  돈가스: ${ko(s.donkatsu)}`,
    "",
  ]);
}

function opening(): string[] {
  return N.opening.flatMap((b, i) => [
    `=== ${i + 1}. ${b.id} ===`,
    b.teaches ? `  (${b.teaches})` : "",
    ...scene(b.scene),
    "",
  ]);
}

function story(): string[] {
  const beats = N.story.flatMap((b) => [
    `=== ${b.week}주 · ${ko(b.title)} (${b.after}) ===`,
    ...(b.announce ?? []).map((id) => {
      const m = N.announcements.find((x) => x.id === id);
      return `  《${m ? nameOf(m.voice) : ""}》 ${ko(m?.text)}`;
    }),
    ...(b.lines ?? []).flatMap(step),
    ...(b.cutscene ? [`  ▶ 컷신 ${b.cutscene}`] : []),
    "",
  ]);
  const fights = N.bosses.flatMap((b) => [
    `=== 전투 대사 · ${nameOf(b.boss)} ===`,
    ...(b.theses ?? []).map((k) => `  논제: ${ko(k)}`),
    ...b.fight.flatMap((f) => [
      `  <${f.on}${f.phase ? ` · ${f.phase}` : ""}>`,
      ...f.lines.flatMap((l) => line(l, "    ")),
    ]),
    "",
  ]);
  return [...beats, ...fights];
}

function cutscenes(): string[] {
  return N.cutscenes.flatMap((c) => [`=== ${c.id} ===`, ...scene(c), ""]);
}

const SECTION = {
  scientist: "과학자",
  misconception: "오개념",
  book: "책",
  school: "학교",
} as const;

function codex(): string[] {
  return N.codex.flatMap((e) => {
    const head = `■ [${SECTION[e.section]}] ${ko(e.name)}`;
    const body =
      e.section === "scientist"
        ? [
            `  시대: ${ko(e.era)}`,
            `  누구: ${ko(e.who)}`,
            `  맞은 것: ${ko(e.right)}`,
            `  틀린 이론: ${ko(e.wrong)}`,
            `  바뀐 것: ${ko(e.replaced)}`,
          ]
        : e.section === "book"
          ? [`  ${ko(e.flavor)}`, `  원리: ${ko(e.concept)}`]
          : [`  ${ko(e.body)}`];
    return [head, ...body, ...e.sources.map((u) => `  출처: ${u}`), ""];
  });
}

function hub(): string[] {
  const barks = N.barks.map(
    (b) => `${nameOf(b.speaker)} [${b.from}${b.until ? ` → ${b.until}` : ""}]: ${ko(b.text)}`,
  );
  const desc = N.descriptions.map((d) => `■ ${ko(d.name)} (${d.kind}) ${ko(d.desc)}`);
  const eggs = N.eggs.flatMap((e) => [
    `◆ ${e.id}: ${e.nod}`,
    ...e.texts.map((k) => `    ${ko(k)}`),
  ]);
  return ["=== 대사 ===", ...barks, "", "=== 설명 ===", ...desc, "", "=== 이스터에그 ===", ...eggs];
}

function quests(): string[] {
  return N.quests.map(
    (q) => `[${ko(q.poster)}] ${ko(q.title)} (${q.kind}/${q.cadence})\n    ${ko(q.body)}`,
  );
}

function system(): string[] {
  const msgs = [...N.system, ...N.announcements].map(
    (m) => `${m.id} 《${nameOf(m.voice)}》 ${ko(m.text)}`,
  );
  const awards = N.awards.map(
    (a) =>
      `${ko(N.awardFrame.heading)} · ${ko(a.title)}\n    ${ko(a.citation)}\n    ${ko(N.awardFrame.signature)}`,
  );
  return [...msgs, "", ...awards];
}

const PARTS: Record<string, () => string[]> = {
  voices,
  opening,
  story,
  cutscenes,
  codex,
  hub,
  quests,
  system,
};
const part = process.argv[2] ?? "opening";
const render = PARTS[part];
if (!render) throw new Error(`unknown part ${part}; one of ${Object.keys(PARTS).join(", ")}`);
console.log(render().join("\n"));
