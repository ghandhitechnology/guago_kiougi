/**
 * Easter eggs for anyone who lived in a science high school dorm: harmless, unexplained, and
 * meaningless to everyone else. Each is carried by a prop, an item or a bark; `nod` says what it
 * nods to in general terms. No real name, place or person.
 */
import { Writer } from "./author.ts";
import type { Bark, Description, EasterEgg } from "./schema.ts";
import { ANNOUNCEMENTS, AWARDS } from "./system.ts";

const w = new Writer("egg");

const keyOf = <T extends { id: string }>(
  list: readonly T[],
  id: string,
  pick: (t: T) => string,
): string => {
  const found = list.find((t) => t.id === id);
  if (!found) throw new Error(`easter egg refers to missing ${id}`);
  return pick(found);
};

const graffiti = w.scope("graffiti");
const fan = w.scope("fan");
const car = w.scope("car");
const bed = w.scope("bed");
const square = w.scope("square");
const flashlight = w.scope("flashlight");
const song = w.scope("song");
const door = w.scope("door");

const prop = (
  scope: ReturnType<Writer["scope"]>,
  id: string,
  kind: Description["kind"],
  name: string,
  desc: string,
): Description => ({
  id,
  kind,
  name: scope.t(name),
  desc: scope.t(desc),
});

export const EGG_DESCRIPTIONS: readonly Description[] = [
  prop(
    graffiti,
    "standing-desk-graffiti",
    "prop",
    "졸방대 낙서",
    "학기마다 지워지고 학기마다 다시 생긴다. 맨 아래 한 줄은 세 번 살아남았다.",
  ),
  prop(
    fan,
    "wind-tunnel",
    "prop",
    "비싼 선풍기",
    "증명관 풍동실의 측정 장비. 값은 억 단위다. 바람은 정말 잘 나온다.",
  ),
  prop(
    car,
    "electric-car",
    "prop",
    "전기차",
    "실험동 앞. 바퀴가 둘 빠져 있고, 운전석에 쪽지가 붙어 있다.",
  ),
  prop(
    bed,
    "infirmary-bed",
    "prop",
    "보건실 침대",
    "학교에서 가장 푹신한 물건. 이불이 늘 반듯하다.",
  ),
  prop(
    flashlight,
    "broken-flashlight",
    "item",
    "고장 난 손전등",
    "급식실 지하 문 앞에 굴러다니던 것. 배터리 뚜껑에 매직으로 0조라고 적혀 있다.",
  ),
  prop(
    door,
    "beep-door",
    "prop",
    "실험동 3층 문",
    "열 때마다 삐 소리가 난다. 문틀에 바를 정 자가 빽빽하다.",
  ),
];

/**
 * Map objects that carry an egg under the map's own id: the car pushed out in front of 실험동,
 * the second 졸방대 with the graffiti on it, and the 보건실 bed.
 */
const alias = (id: string, of: string): Description => {
  const d = EGG_DESCRIPTIONS.find((x) => x.id === of);
  if (!d) throw new Error(`easter egg refers to missing ${of}`);
  return { ...d, id };
};

export const EGG_PROPS: readonly Description[] = [
  alias("ev", "electric-car"),
  alias("standing-desk-2", "standing-desk-graffiti"),
  alias("bed", "infirmary-bed"),
];

const graffitiRows = [
  graffiti.t("야자 끝나기 십 분 전이 제일 길다"),
  graffiti.t("졸면 서고 서면 존다"),
  graffiti.t("여기 서서 쓴 사람 다 졸업함"),
];
const carNote = [
  car.t("전기차 · 향년 2세"),
  car.t("두 명이 탄 첫날 서스펜션이 내려앉음"),
  car.t("편히 쉬어라"),
];

export const EGG_BARKS: readonly Bark[] = [
  {
    speaker: "senior-math",
    text: square.t("운동장 재 봤어. 정사각형이야. 오차 없이."),
    from: "p1.open",
    where: "field",
  },
  {
    speaker: "garam",
    text: song.t("기상송 나오기 전에 방에서 나가. 그게 유일한 생존법이야."),
    from: "p1.open",
    where: "dawn-hall",
  },
  {
    speaker: "nurse",
    text: bed.t("누워 보고 싶었죠? 다들 그래요. 오 분이에요."),
    from: "p1.open",
    where: "infirmary",
  },
  {
    speaker: "senior-chem",
    text: door.t("3층 문은 열 때마다 삐 소리가 나요. 나갔다가 다시 들어오면 멈춰요."),
    from: "p1.open",
    where: "lab-building",
  },
];

const descKey = (id: string) => keyOf(EGG_DESCRIPTIONS, id, (d) => d.desc);
const barkKey = (i: number) => EGG_BARKS[i]?.text ?? "";

export const EGGS: readonly EasterEgg[] = [
  {
    id: "graffiti",
    where: "standing-desk",
    texts: [descKey("standing-desk-graffiti"), ...graffitiRows],
    nod: "Tall standing desks in study halls collect graffiti that gets scrubbed every term and comes back.",
  },
  {
    id: "expensive-fan",
    where: "wind-tunnel",
    texts: [descKey("wind-tunnel")],
    nod: "Science schools own one very expensive measuring rig that students treat as a fan.",
  },
  {
    id: "car-obituary",
    where: "electric-car",
    texts: [descKey("electric-car"), ...carNote],
    nod: "A club-built vehicle that broke on its first ride, sat for years on an empty ground floor and was finally pushed outside.",
  },
  {
    id: "cozy-bed",
    where: "infirmary-bed",
    texts: [descKey("infirmary-bed"), barkKey(2), keyOf(AWARDS, "lay-down", (a) => a.title)],
    nod: "The infirmary bed everyone means to lie on once.",
  },
  {
    id: "square-field",
    where: "senior-math",
    texts: [barkKey(0)],
    nod: "A school field that is small and exactly square.",
  },
  {
    id: "flashlight",
    where: "broken-flashlight",
    texts: [descKey("broken-flashlight")],
    nod: "The sealed tunnel under the cafeteria that every dorm has a story about.",
  },
  {
    id: "wake-song",
    where: "garam",
    texts: [barkKey(1), keyOf(ANNOUNCEMENTS, "daily-reset", (a) => a.text)],
    nod: "The dorm wake-up song that repeats until everyone hates it.",
  },
  {
    id: "beep-door",
    where: "beep-door",
    texts: [descKey("beep-door"), barkKey(3)],
    nod: "A door lock that beeps on every entry; the fix is to step out and come back in.",
  },
];

export const EGGS_KO = w.ko;
