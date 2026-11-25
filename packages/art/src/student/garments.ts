import type { PartDef } from "../format.ts";
import { garment } from "./base.ts";

/** 동복: navy blazer, white collar, red tie, gold buttons. */
export const blazer = garment(
  {
    "1": "navy.deep",
    "2": "navy.light",
    "3": "navy.dark",
    "4": "navy.deep",
    "5": "navy.mid",
    "6": "navy.dark",
  },
  {
    down: `
      NNwmmwNN
      NVwmrwvN
      NVVmrvnN
      NVVmrvnN
      NvvvvvnN
      NvvvvvnN
      NNNNNNNN
    `,
    up: `
      NNNNNNNN
      NVvvvvnN
      NVvvvvnN
      NVvvvvnN
      NvvvvvnN
      NvvvvvnN
      NNNNNNNN
    `,
    side: `
      NNwwmN
      NVvwmN
      NVvVmN
      NvvVrN
      NvvVrN
      NvvVrN
      NNNNNN
    `,
  },
  true,
);

/** 하복: short-sleeved white shirt, the same tie, a belt. */
export const shirt = garment(
  {
    "1": "stone.deep",
    "2": "stone.bright",
    "3": "stone.light",
    "4": "skin.deep",
    "5": "skin.mid",
    "6": "skin.dark",
  },
  {
    down: `
      GGwmmwGG
      GwwmrwqG
      GpwmrwqG
      GppmrqqG
      GwppppqG
      GwppppqG
      GGGGGGGG
    `,
    up: `
      GGGGGGGG
      GwppppqG
      GwppppqG
      GwppppqG
      GwpppqqG
      GwpppqqG
      GGGGGGGG
    `,
    side: `
      GGwwmG
      GwpwmG
      GwppmG
      GwpprG
      GwpprG
      GwpprG
      GGGGGG
    `,
  },
  true,
);

/**
 * 과잠: the club jacket, in the club's colour with cream sleeves, a cream rib at the collar and
 * hem, snaps down the front and a cream letter on the chest. The back is left plain for the club's
 * emblem, drawn at the `emblem` anchor.
 */
export const varsity: PartDef = {
  ...garment(
    {
      "1": "jacket.deep",
      "2": "stone.bright",
      "3": "stone.light",
      "4": "jacket.deep",
      "5": "stone.pale",
      "6": "stone.light",
    },
    {
      down: `
        JCw..wcJ
        JCCwwccJ
        JCCcJwcJ
        JCCcJwcJ
        JCCcJccJ
        JcccJjjJ
        JwwwwwwJ
        JJJJJJJJ
      `,
      up: `
        JjjjjjjJ
        JCccccjJ
        JCccccjJ
        JCccccjJ
        JCccccjJ
        JCccccjJ
        JccccjjJ
        JJJJJJJJ
      `,
      side: `
        JJJJJ.
        JCccJ.
        JCccJ.
        JcccJ.
        JcccJ.
        JcccJ.
        JcccJ.
        .JJJJ.
      `,
    },
    false,
  ),
  anchors: { emblem: { bone: "torso", at: { up: [9, 14] } } },
};

/**
 * 체육복: the teal track kit nobody changes out of after PE, zipped to the collar, a stripe across
 * the chest in the wearer's cohort colour, white trainers.
 */
export const gym = garment(
  {
    "1": "sea.deep",
    "2": "sea.light",
    "3": "sea.mid",
    "4": "sea.deep",
    "5": "sea.light",
    "6": "sea.mid",
    B: "sea.deep",
    d: "sea.mid",
    e: "sea.deep",
    I: "sea.light",
    i: "sea.mid",
    z: "sea.dark",
    "#": "cohort.mid",
    "+": "cohort.light",
  },
  {
    down: `
      BBBBwBBB
      BlllwddB
      B+++w##B
      BlllwddB
      BlllwddB
      BbbbbbbB
      BBBBBBBB
    `,
    up: `
      BBBBBBBB
      BllllddB
      B++++##B
      BllllddB
      BllldddB
      BbbbbbbB
      BBBBBBBB
    `,
    side: `
      BBBBwB
      BlldwB
      BlldwB
      BlldwB
      BlldwB
      BdddwB
      BBBBBB
    `,
  },
  true,
);

/** 생활복: a camel cardigan over the shirt and tie, sleeves pulled over the hands in winter. */
export const cardigan = garment(
  {
    "1": "wood.deep",
    "2": "wood.pale",
    "3": "wood.light",
    "4": "wood.deep",
    "5": "wood.pale",
    "6": "wood.light",
    W: "wood.deep",
    "*": "wood.deep",
    P: "wood.pale",
    Q: "wood.light",
    o: "wood.mid",
  },
  {
    down: `
      WWwmmwWW
      WPwmrwQW
      WPPmrQQW
      WPPP*QQW
      WPPPPQoW
      WQQQQooW
      WWWWWWWW
    `,
    up: `
      WWWWWWWW
      WPPPPQQW
      WPPPPQQW
      WPPPQQoW
      WPPPQQoW
      WQQQQooW
      WWWWWWWW
    `,
    side: `
      WWwwmW
      WPQwmW
      WPQQmW
      WPQQWW
      WPQQoW
      WQQQoW
      WWWWWW
    `,
  },
  true,
);

/** 실험복: a lab coat worn open to the knee, a pen in the breast pocket. */
export const labcoat = garment(
  {
    "1": "stone.deep",
    "2": "stone.bright",
    "3": "stone.light",
    "4": "stone.deep",
    "5": "stone.pale",
    "6": "stone.light",
    g: "stone.mid",
  },
  {
    down: `
      Gww..qqG
      Gww..qqG
      Gwp..vqG
      Gwp..vqG
      Gwp..qgG
      Gpp..qgG
      Gpp..ggG
      Gpp..ggG
      Gpp..ggG
      GGG..GGG
    `,
    up: `
      GGGGGGGG
      GwwwwqqG
      GwwwwqqG
      GwpppqqG
      GwpppqgG
      GpppqqgG
      GpppGqgG
      GpppGggG
      GpppGggG
      GGGGGGGG
    `,
    side: `
      GGGGG.
      GwwqG.
      GwwqG.
      GwpqG.
      GwpqG.
      GppqG.
      GppgG.
      GppgG.
      GppgG.
      GGGGG.
    `,
  },
  false,
);

/** 우비: a yellow raincoat, hood down, toggles done up wrong. */
export const raincoat = garment(
  {
    "1": "gold.deep",
    "2": "gold.pale",
    "3": "gold.light",
    "4": "gold.deep",
    "5": "gold.light",
    "6": "gold.mid",
    A: "gold.light",
    Y: "gold.pale",
  },
  {
    down: `
      DYYDDaaD
      DYAAaaaD
      DYAAWaaD
      DYAAWaaD
      DAAAaaaD
      DAAAWaaD
      DAAAWaaD
      DAAAaaaD
      DDDDDDDD
    `,
    up: `
      DDDDDDDD
      DYYYYAAD
      DYAAAaaD
      DDDDDDDD
      DAAAAaaD
      DAAAAaaD
      DAAAAaaD
      DAAAaaaD
      DDDDDDDD
    `,
    side: `
      DDDDD.
      DYAAD.
      DYAaD.
      DYAaD.
      DAAaD.
      DAAaD.
      DAAaD.
      DAaaD.
      DDDDD.
    `,
  },
  false,
);
