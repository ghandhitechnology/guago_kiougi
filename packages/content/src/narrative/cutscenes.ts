/**
 * Page 1's three cutscenes (PLAN §24): the moment each boss is freed, when the wrong theory gives
 * way to what replaced it. Each freed mind says the Act I line in its own words: whatever held
 * them seemed to know what they would think next (PLAN §4 "Shape of Theme 1").
 * Also the 명령퇴사 home scene (PLAN §11), which is a system scene, not a story one.
 */
import { anim, camera, fx, move, music, play, sound, Writer, wait } from "./author.ts";
import type { Cutscene } from "./schema.ts";

const w = new Writer("cutscene");

// 1. 피타고라스 학파 ------------------------------------------------------------------------------

const p = w.scope("pythagoreans-freed");
const pythagoreans: Cutscene = {
  id: "p1-pythagoreans-freed",
  map: "p1-croton-school",
  cast: ["player", "entropy", "pythagoreans", "senior-math"],
  marks: ["grid-center", "corner-a", "corner-b", "sea"],
  steps: [
    fx("freeze-field"),
    music(null),
    camera("grid-center", 800),
    fx("diagonal-glow", "corner-a"),
    sound("chalk"),
    p.say("pythagoreans", "그 선을 긋지 마라.", "chorus"),
    p.say(
      "pythagoreans",
      "한 변이 하나인 정사각형이다. 대각선도 두 정수의 비로 쓴다. 써야 한다.",
      "chorus",
    ),
    p.say("pythagoreans", "칠 대 오.", "chorus"),
    p.say("pythagoreans", "모자라다. 십칠 대 십이.", "chorus"),
    p.say("pythagoreans", "넘친다. 사십일 대 이십구.", "chorus"),
    p.say("pythagoreans", "모자라다. 구십구 대 칠십.", "chorus"),
    p.say("pythagoreans", "넘친다.", "chorus"),
    p.say("entropy", "안 끝난다. 그 길이는 비가 없다."),
    wait(1200),
    p.say("pythagoreans", "…나는.", "one"),
    p.say("pythagoreans", "나는 알고 있었다. 이 대각선은 끝까지 셀 수 없다는 것을.", "one"),
    p.say("pythagoreans", "형제여.", "chorus"),
    p.say(
      "pythagoreans",
      "이것을 바깥에 말한 형제가 바다에 빠졌다는 이야기가 있다. 우리도 그 이야기가 참인지 모른다.",
      "one",
    ),
    p.say("pythagoreans", "이제 말하겠다. 비로 쓸 수 없는 길이도 길이다.", "one"),
    p.say("senior-math", "무리수. 길이는 있는데 비가 없는 수."),
    p.say("pythagoreans", "무리수.", "chorus"),
    fx("grid-dissolve", "grid-center"),
    sound("sea"),
    camera("sea", 1600),
    p.say(
      "pythagoreans",
      "이상한 일이 있었다. 우리가 다음에 셀 수를, 누군가 먼저 세고 있었다.",
      "one",
    ),
    wait(900),
    p.say("pythagoreans", "그래도 콩은 먹지 않는다.", "chorus"),
    fx("fade-out"),
  ],
};

// 2. 제논 --------------------------------------------------------------------------------------

const z = w.scope("zeno-freed");
const zeno: Cutscene = {
  id: "p1-zeno-freed",
  map: "p1-elea-track",
  cast: ["player", "entropy", "zeno", "tortoise"],
  marks: ["start", "zeno", "rings", "finish"],
  steps: [
    fx("freeze-field"),
    camera("rings", 800),
    fx("limit-rings", "rings"),
    z.say("zeno", "반. 그리고 반의 반. 그리고 또…."),
    z.say("zeno", "이상하네요. 끝없이 더하는데 하나를 넘지 않아요."),
    z.say("entropy", "무한 번 더해도 하나다."),
    move("player", "zeno", 900),
    fx("dash-arrive", "zeno"),
    wait(800),
    z.say("zeno", "…도착하셨네요."),
    z.say("zeno", "처음 해 보는 말이에요. 도착."),
    z.say(
      "zeno",
      "저희 선생님은 있는 것은 하나라고 하셨어요. 저는 그 말씀을 지키려고 질문을 만들었고요. 선생님께 뭐라고 말씀드리죠.",
    ),
    z.say("entropy", "질문은 좋았다."),
    z.say(
      "zeno",
      "그 안에서는요, 제가 질문을 떠올리기도 전에 답이 먼저 와 있었어요. 질문하는 사람한테는 그게 제일 무서운 일이에요.",
    ),
    camera("tortoise", 900),
    z.say("zeno", "거북 씨, 이제 가셔도 돼요. 아무도 못 따라잡는 척은 그만하셔도 돼요."),
    anim("tortoise", "head-out"),
    move("tortoise", "finish", 5000),
    fx("fade-out"),
  ],
};

// 3. 아리스토텔레스 ------------------------------------------------------------------------------

const a = w.scope("aristotle-freed");
const aristotle: Cutscene = {
  id: "p1-aristotle-freed",
  map: "p1-lyceum",
  cast: ["player", "entropy", "aristotle", "aristarchus", "block"],
  marks: ["ice", "block-start", "far-edge", "column", "lectern"],
  steps: [
    fx("ice-spread", "ice"),
    sound("ice"),
    camera("block-start", 700),
    fx("block-slide", "block-start"),
    move("block", "far-edge", 5200),
    a.say("aristotle", "멈추게.", "lecture"),
    a.say("aristotle", "미는 손이 없네. 그러니 멈춰야 하네.", "lecture"),
    wait(1500),
    a.say("aristotle", "…왜 멈추지 않는가.", "stunned"),
    a.say("entropy", "멈출 까닭이 없으니까."),
    a.say("aristotle", "그 말은….", "stunned"),
    a.say(
      "aristotle",
      "진공이 없다는 걸 보이려고 내가 따진 말일세. 아무것도 막지 않는 곳이라면 움직이는 것이 멈출 까닭이 없을 테니, 그런 곳은 있을 리 없다고.",
      "stunned",
    ),
    a.say("aristotle", "나는 그 결론이 우스워서 버렸네. 그런데 우스운 쪽이 맞았군.", "stunned"),
    fx("theory-break", "lectern"),
    camera("column", 700),
    anim("entropy", "paw"),
    fx("two-stones", "column"),
    sound("stone-land"),
    a.say("aristotle-freed", "큰 돌과 작은 돌이… 거의 같이 떨어졌네.", "curious"),
    a.say(
      "aristotle-freed",
      "그 안에서 나는 관찰당하고 있었네. 내가 다음에 무엇을 생각할지, 누군가 먼저 적어 두더군.",
    ),
    move("aristarchus", "column", 1400),
    a.say("aristarchus", "저 선생 책으로 공부했어. 직접 보니까 키가 크네."),
    a.ask("aristotle-freed", "자네. 그 얼음 위에서 무엇이 그 돌을 밀었나.", "curious", [
      ["아무것도요.", [a.line("aristotle-freed", "그렇지. 아무것도.")]],
      [
        "…관성이요.",
        [a.line("aristotle-freed", "관성. 처음 듣는 말이군. 이름이 좋네.", "curious")],
      ],
    ]),
    a.say("aristotle-freed", "적어 두겠네."),
    fx("fade-out"),
  ],
};

// 명령퇴사: home --------------------------------------------------------------------------------

const h = w.scope("expel-home");
const home: Cutscene = {
  id: "expel-home",
  map: "home",
  cast: ["player", "parent"],
  marks: ["door", "table", "fridge", "desk", "sink"],
  steps: [
    music("home"),
    fx("fade-in"),
    move("player", "table", 1200),
    h.say("parent", "왔어? 학교에서 전화 왔더라."),
    h.ask("parent", "밥은 잘 먹고 다니니?", undefined, [
      ["네.", [h.line("parent", "얼굴은 아니라는데.")]],
      ["…아니요.", [h.line("parent", "그럴 줄 알았어.")]],
    ]),
    h.say("parent", "냉장고에 장조림 있어. 다 먹고 가."),
    h.say("parent", "벌점은… 밥 먹고 얘기하자."),
    camera("fridge", 900),
    // The ten minutes at home: one line a minute while the player can walk the room.
    play("home-minute:1"),
    h.bubble("parent", "밥 데울게. 앉아 있어."),
    play("home-minute:2"),
    h.say("parent", "선생님이 그러시더라. 애는 착한데 밤에 자꾸 밖에 있다고."),
    play("home-minute:3"),
    h.say("parent", "엄마 화 안 났어. 진짜로."),
    play("home-minute:4"),
    h.bubble("parent", "네 방 그대로 뒀어. 책상에 먼지만 좀 앉았어."),
    h.bubble("parent", "물 마셔. 학교 물은 맛없다며."),
    play("home-minute:5"),
    h.ask("parent", "학교 밥은 어때?", undefined, [
      ["수요일엔 짜장면 나와요.", [h.line("parent", "그래? 그럼 수요일엔 벌점 받지 마.")]],
      ["…그냥 그래요.", [h.line("parent", "그래. 다행이네.")]],
    ]),
    play("home-minute:6"),
    h.say("parent", "스무 번이면… 그래도 뭘 스무 번은 열심히 했다는 거네."),
    play("home-minute:7"),
    h.say("parent", "아빠한테는 말 안 했어. 오늘은."),
    play("home-minute:8"),
    h.bubble("parent", "장조림 남은 거 통에 담았어. 가방에 넣어 놨다."),
    play("home-minute:9"),
    h.say("parent", "이제 가야지. 버스 놓친다."),
    play("home-minute:10"),
    move("player", "door", 1200),
    h.say("parent", "다음엔 그냥 놀러 와. 벌점 말고."),
    fx("fade-out"),
  ],
};

export const CUTSCENES: readonly Cutscene[] = [pythagoreans, zeno, aristotle, home];
export const CUTSCENES_KO = w.ko;
