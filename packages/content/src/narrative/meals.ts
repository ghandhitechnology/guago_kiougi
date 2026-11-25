/**
 * The 급식 rotation (PLAN §11, lifecycle.ts `MEALS`): one menu a board day, so the week runs
 * 목 돈가스, 금 비빔밥, 토 김치찌개, 일 카레, 월 불고기, 화 미역국, 수 짜장면. Each menu is a
 * `meal:<id>` description (name, and the buff line the player reads) and a line from the
 * 조리사님 when it is served. Wednesday is 특식.
 */
import { Writer } from "./author.ts";
import type { CopyPart, Description, SystemMessage } from "./schema.ts";

const w = new Writer("meal");

type Menu = readonly [id: string, name: string, buff: string, served: string];

const MENUS: readonly Menu[] = [
  [
    "donkatsu",
    "돈가스",
    "먹고 나면 주는 피해가 는다. 소스는 한 국자까지.",
    "돈가스 날이야. 소스는 한 국자만. 뒤에 줄 봐.",
  ],
  [
    "bibimbap",
    "비빔밥",
    "먹고 나면 체력이 조금씩 차오른다. 고추장은 알아서.",
    "고추장은 알아서 넣어. 많이 넣으면 내일 아침에 알게 돼.",
  ],
  [
    "kimchi-stew",
    "김치찌개",
    "먹고 나면 경험치가 더 쌓인다. 주말에 남은 사람 몫이라 고기가 많다.",
    "주말에 남은 애들 거야. 고기 하나 더 넣었다.",
  ],
  [
    "curry",
    "카레라이스",
    "먹고 나면 솔방울이 더 모인다. 어제 끓인 거라 더 맛있다.",
    "카레는 이틀째가 맛있어. 오늘이 이틀째야.",
  ],
  [
    "bulgogi",
    "불고기 덮밥",
    "먹고 나면 주는 피해가 는다. 월요일엔 다들 집밥 얘기를 한다.",
    "월요일이라 다들 집밥 얘기만 해. 그래서 불고기 했어.",
  ],
  [
    "seaweed-soup",
    "미역국",
    "먹고 나면 체력이 조금씩 차오른다. 오늘 누군가는 생일이다.",
    "오늘 생일인 애 있지? 누군지 몰라도 돼. 미역국은 다 같이 먹는 거야.",
  ],
  [
    "jjajang",
    "수요 특식 짜장면",
    "먹고 나면 경험치가 더 쌓인다. 4교시가 끝나기 전부터 복도가 달린다.",
    "뛰지 마. 면 안 불어. …불긴 불어. 빨리 와.",
  ],
];

const menu = w.scope("menu");
const served = w.scope("served");

const MEAL_DESCRIPTIONS: readonly Description[] = MENUS.map(([id, name, buff]) => ({
  id: `meal:${id}`,
  kind: "meal",
  name: menu.t(name),
  desc: menu.t(buff),
}));

const line = w.scope("line");

const MEAL_LINES: readonly SystemMessage[] = [
  ...MENUS.map(
    ([id, , , text]): SystemMessage => ({
      id: `meal.eat.${id}`,
      voice: "cook",
      channel: "dialogue",
      text: served.t(text),
      slots: [],
    }),
  ),
  {
    id: "meal.full",
    voice: "cook",
    channel: "toast",
    text: line.t("아직 배 안 꺼졌잖아. 좀 이따 와."),
    slots: [],
  },
  {
    id: "meal.sent-home",
    voice: "cook",
    channel: "toast",
    text: line.t("집에 간 애는 집에서 먹어. 그게 맞아."),
    slots: [],
  },
];

/** Broadcast when Wednesday's board turns over. */
const MEAL_ANNOUNCEMENTS: readonly SystemMessage[] = [
  {
    id: "menu-wednesday",
    voice: "broadcast",
    channel: "system",
    text: line.t(
      "교내 방송입니다. 오늘 급식은 수요 특식 짜장면입니다. 복도에서 뛰지 마십시오. 다시 알려 드립니다. 짜장면입니다.",
    ),
    slots: [],
  },
];

export const MEALS_COPY: CopyPart = {
  descriptions: MEAL_DESCRIPTIONS,
  system: MEAL_LINES,
  announcements: MEAL_ANNOUNCEMENTS,
  ko: w.ko,
};
