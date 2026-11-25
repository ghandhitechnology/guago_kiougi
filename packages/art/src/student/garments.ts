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

/** 과잠: the club jacket. Worn open, cream sleeves, a cream panel on the back for the emblem. */
export const varsity = garment(
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
      JCj..jcJ
      JCj..jcJ
      JCj..jcJ
      Jwj..jcJ
      Jwj..jcJ
      JJJ..JJJ
      JJJ..JJJ
    `,
    up: `
      JjjjjjjJ
      JCccccjJ
      JCwwwwjJ
      JCwppwjJ
      JCwwwwjJ
      JjjjjjjJ
      JJJJJJJJ
    `,
    side: `
      JJJJJ.
      JcccJ.
      JcccJ.
      JcccJ.
      JcccJ.
      JJJJJ.
      JJJJJ.
    `,
  },
  false,
);

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
