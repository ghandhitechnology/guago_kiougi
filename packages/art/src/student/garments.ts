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
