/** What the UI sections of the contact sheet show. Browser-safe, shared by page and PNGs. */

export const SHEET = {
  bg: "ink.deep",
  head: "stone.bright",
  dim: "ink.light",
  night: "ink.dark",
  chalk: "stone.bright",
  paper: "stone.bright",
  ink: "ink.dark",
  ground: "grass.mid",
} as const;

export const FONT_SAMPLES = [
  {
    font: "galmuri11",
    lines: [
      "다람쥐 헌 쳇바퀴에 타고파. 「그거, 이제 무기야.」",
      "점호 시간입니다. 전원 기숙사로 복귀하십시오.",
      "필기 +7 → +8 · 성공 확률 80% · 잉크 27 · 솔방울 585",
      "Lv.87 HP 1,204/1,927 ABCDEFG abcdefg ~!?…♪ ㅋㅋ ㅠㅠ",
    ],
  },
  {
    font: "galmuri11-bold",
    lines: [
      "가방 장비 캐릭터 수행평가 연구노트 도감",
      "아리스토텔레스 · 논제 2 · 다람쥐 헌 쳇바퀴",
    ],
  },
  {
    font: "galmuri9",
    lines: [
      "다람쥐 헌 쳇바퀴에 타고파. 이해한 만큼 아프다.",
      "벌점 3 · 자습 3시간 20분 · 리케이온 · 엔트로피",
      "「점호」 『0조 연구노트』 · πΣΔθλμ · 0123456789",
    ],
  },
] as const;

export const NUMERAL_SAMPLES = [
  "1,181",
  "2,953!",
  "+412",
  "−86",
  "2.9만",
  "12억",
  "3조",
  "×3",
  "100%",
];

export interface KitGroup {
  readonly title: string;
  /** Shown on paper instead of the field colour. */
  readonly paper?: boolean;
  readonly sprites: readonly string[];
  /** Sizes each nine-slice is shown stretched to. */
  readonly stretch?: Readonly<Record<string, readonly (readonly [number, number])[]>>;
}

export const KIT: readonly KitGroup[] = [
  {
    title: "surfaces",
    sprites: [
      "panel",
      "label",
      "dialog",
      "nametab",
      "portrait-slot",
      "portrait-corners",
      "caret",
      "tooltip",
      "bubble",
      "bubble-tail",
      "nameplate",
    ],
    stretch: {
      panel: [
        [72, 56],
        [180, 110],
      ],
      label: [
        [36, 15],
        [60, 15],
      ],
      dialog: [
        [80, 32],
        [200, 60],
      ],
      nametab: [
        [40, 16],
        [72, 16],
      ],
      tooltip: [
        [48, 24],
        [104, 40],
      ],
      bubble: [
        [36, 16],
        [84, 24],
      ],
      nameplate: [
        [32, 13],
        [64, 13],
      ],
    },
  },
  {
    title: "on the page",
    paper: true,
    sprites: [
      "inset",
      "row",
      "tab",
      "btn",
      "btn-ink",
      "check",
      "slider-track",
      "slider-fill",
      "slider-knob",
      "scroll-track",
      "scroll-thumb",
      "item",
      "item-empty",
      "item-select",
    ],
    stretch: {
      inset: [
        [40, 24],
        [120, 48],
      ],
      row: [
        [64, 16],
        [140, 16],
      ],
      tab: [
        [32, 15],
        [56, 15],
      ],
      btn: [
        [40, 19],
        [88, 19],
      ],
      "btn-ink": [
        [40, 19],
        [88, 19],
      ],
      "slider-track": [
        [48, 5],
        [96, 5],
      ],
      "slider-fill": [
        [24, 3],
        [60, 3],
      ],
      "scroll-track": [
        [5, 40],
        [5, 80],
      ],
      "scroll-thumb": [
        [5, 16],
        [5, 40],
      ],
    },
  },
  {
    title: "hud",
    sprites: [
      "close",
      "bar",
      "bar-thin",
      "fill",
      "fill-thin",
      "boss-bar",
      "boss-tick",
      "mode",
      "mode-icon",
      "book-slot",
      "cooldown",
      "lock",
      "minimap",
      "map-dot",
      "hud-plate",
    ],
    stretch: {
      bar: [
        [48, 9],
        [120, 9],
      ],
      "bar-thin": [
        [48, 5],
        [120, 5],
      ],
      fill: [
        [30, 7],
        [80, 7],
      ],
      "fill-thin": [
        [30, 3],
        [80, 3],
      ],
      "boss-bar": [
        [120, 19],
        [200, 19],
      ],
      mode: [
        [52, 14],
        [66, 14],
      ],
      minimap: [
        [48, 48],
        [64, 40],
      ],
      "hud-plate": [
        [32, 16],
        [64, 20],
      ],
    },
  },
  {
    title: "touch",
    sprites: ["stick-base", "stick-knob", "touch-main", "touch-btn", "touch-icon"],
  },
  {
    title: "icons",
    paper: true,
    sprites: ["icon", "menu", "emblem", "book", "book-dim", "tool"],
  },
];
