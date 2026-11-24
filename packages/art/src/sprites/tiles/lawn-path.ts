import { terrain } from "../../format.ts";

/** 잔디 over 흙길: the campus lawn and the dirt paths worn across it. */
export default terrain({
  name: "lawn-path",
  upper: "grass",
  lower: "dirt",
  palette: {
    ".": null,
    g: "grass.light",
    G: "grass.mid",
    D: "grass.dark",
    h: "grass.pale",
    b: "wood.pale",
    m: "wood.light",
    n: "wood.mid",
    l: "clay.pale",
    k: "stone.pale",
    K: "stone.mid",
    w: "stone.bright",
    y: "gold.light",
    Y: "gold.mid",
    t: "grass.mid",
    u: "grass.pale",
    f: "clay.light",
    F: "clay.mid",
  },
  lone: "tulyY",
  outer: `
    ................................................
    ................................................
    ................................................
    ................................................
    ................................................
    ................................................
    ................................................
    ................................................
    ...........hhhhhhhhhhhhhhhhhhhhhhhhhhh..........
    .........hhgggggggggggutggggggggggggghGm........
    .........hggtgtgggggggggggggtgtgggggggGm........
    ........hggggtgggggggggggggggtgggggggggGm.......
    ........hgggggggguugggggggggggggguuggggGm.......
    ........hggggggggggggggguggggggggggggggGm.......
    ........hgggggggggggggggtggggggggggggggGm.......
    ........hggggggggggggggggggggggggggggggGm.......
    ........hggggggggggggggggggggggggggggggGm.......
    ........hggggggggggggggggggggggggggggggGm.......
    ........htgtgggggggggggggtgtgggggggggggGm.......
    ........hgtgggggggugggggggtggggggguggggGm.......
    ........hgggggggggtgggggggggggggggtggggGm.......
    ........hgggguugggggggggggggguuggggggggGm.......
    ........hggggggggggggggggggggggggggggggGm.......
    ........hggggggggggggggggggggggggggggggGm.......
    ........hggggggggggggutggggggggggggggutGm.......
    ........hgggggggggggggutgggggggggggggguGm.......
    ........hgggtgtgggggggggggggtgtggggggggGm.......
    ........hggggtgggggggggggggggtgggggggggGm.......
    ........hgggggggguugggggggggggggguuggggGm.......
    ........hggggggggggggggguggggggggggggggGm.......
    ........hgggggggggggggggtggggggggggggggGm.......
    ........hggggggggggggggggggggggggggggggGm.......
    ........hggggggggggggggggggggggggggggggGm.......
    ........hggggggggggggggggggggggggggggggGm.......
    ........htgtgggggggggggggtgtgggggggggggGm.......
    ........GgtgggggggugggggggtggggggguggggGm.......
    ........GgggggggggtgggggggggggggggtggggGm.......
    ........mGGgguugggggggggggggguuggggggGGm........
    ........mDDGGGGGGGGGGGGGGGgggGGGGGGGGDDm........
    .........nnDDDDDDDDDDDDDDDGGGDDDDDDDDnn.........
    .........mmnnnnnnnnnnnnnnnDDDnnnnnnnnmm.........
    ...........mmmmmmmmmmmmmmmnnnmmmmmmmm...........
    ..........................mmm...................
    ................................................
    ................................................
    ................................................
    ................................................
    ................................................
  `,
  inner: `
    gggggggggggggggggggggggggggggggg
    gggggggggggggggggggggggggggggggg
    gggggggggtgtgggggggggggggtgtgggg
    ggugggggggtgggggggugggggggtggggg
    ggtgggggggggggggggtggggggggggggg
    ggggggggggggguugggggggggggggguug
    ggggggggggGGGGGGGGGGGGgggggggggg
    gggggggggGDDDDDDDDDDDDGggggggggg
    gggggutgGGnnnnnnnnnnnnGGgggggggg
    ggggggutGmmmmmmmmmmmmmmGgggggggg
    gggggggGmm............mmhgggtgtg
    gggggggGm..............mhggggtgg
    guuggggGm...............hggggggg
    gggggggGm...............hggggggg
    gggggggGm...............hggggggg
    gggggggGm...............hggggggg
    gggggggGm...............hggggggg
    gggggggGm...............hggggggg
    gggggggGm...............htgtgggg
    gguggggGm...............hgtggggg
    ggtggggGm...............hggggggg
    gggggggGm...............hgggguug
    ggggggggGm.............hgggggggg
    gggggggggGm...........hggggggggg
    gggggutggghhhhhhhhhhhhtggggggggg
    ggggggutggggggggggggggutgggggggg
    ggggggggggggtgtgggggggggggggtgtg
    gggggggggggggtgggggggggggggggtgg
    guugggggggggggggguuggggggggggggg
    gggggggguggggggggggggggguggggggg
    ggggggggtgggggggggggggggtggggggg
    gggggggggggggggggggggggggggggggg
  `,
  base: [
    `
    bbbbbbbbbbbbbbbb
    bbbbbmmbbbbbbbbb
    bbbbbbbbbbbblbbb
    bbbbbbbbbbbbbbbb
    blbbbbbbbbbbbbbb
    bbbbbbbbbmmbbbbb
    bbbbbbbbbbbbbbbb
    bbbbbbbbbbbbbbbb
    bbbmmbbbbbbbbbbb
    bbbbbbbbbbbbbblb
    bbbbbbbblbbbbbbb
    bbbbbbbbbbbbbbbb
    bbbbbbbbbbbbmmbb
    bbbbbbbbbbbbbbbb
    bbbblbbbbbbbbbbb
    bbbbbbbbbbbbbbbb
    `,
    `
    bbbbbbbbbbbbbbbb
    bbbbbbbbbbbbbbbb
    bbbbbbblbbbbbbbb
    bbmmbbbbbbbbbbbb
    bbbbbbbbbbbbbbbb
    bbbbbbbbbbbbbmmb
    bbbbbbbbbbbbbbbb
    bbbbblbbbbbbbbbb
    bbbbbbbbbbbbbbbb
    bbbbbbbbbmmbbbbb
    bbbbbbbbbbbbbbbb
    blbbbbbbbbbbbbbb
    bbbbbbbbbbbbblbb
    bbbbbmmbbbbbbbbb
    bbbbbbbbbbbbbbbb
    bbbbbbbbbbbbbbbb
    `,
    `
    bbbbbbbbbbbbbbbb
    bbbbbbbbbbbblbbb
    bbbbbbbbbbbbbbbb
    bbbbbbbbbbbbbbbb
    bbbbmmbbbbbbbbbb
    bbbbbbbbbbbbbbbb
    bbbbbbbbbbbbbbbb
    bbbbbbbbbbblbbbb
    blbbbbbbbbbbbbbb
    bbbbbbbbbbbbbbbb
    bbbbbbbbbbbbbbbb
    bbbbbbmmbbbbbbbb
    bbbbbbbbbbbbbbbb
    bbbbbbbbbbbbbbmm
    bbbblbbbbbbbbbbb
    bbbbbbbbbbbbbbbb
    `,
  ],
  fill: [
    `
    gggggggggggggggg
    gggggggggggggggg
    ggutgggggggggugg
    gggutggggggggtgg
    gggggggggggggggg
    gggggggggggggggg
    ggggggggggtgtggg
    gggggggggggtgggg
    ggguuggggggggggg
    gggggggggggggggg
    gggggggggggggggg
    gggggguggggggggg
    ggggggtggggggggg
    gggggggggggguugg
    gggggggggggggggg
    gggggggggggggggg
    `,
    `
    gggggggggggggggg
    gggggggggggggggg
    gggggggggggggggg
    gggggggggggugggg
    gggtgtgggggtgggg
    ggggtggggggggggg
    gggggggggggggggg
    gggggggggggggggg
    gggggggggggggggg
    ggggggguuggggggg
    gggggggggggggggg
    ggggggggggutgggg
    gguggggggggutggg
    ggtggggggggggggg
    gggggggggggggggg
    gggggggggggggggg
    `,
  ],
  decals: {
    daisy: {
      on: "upper",
      density: 0.12,
      grid: `
        .w.
        wyw
        .w.
      `,
    },
    buttercups: {
      on: "upper",
      density: 0.08,
      grid: `
        y...
        Y.y.
        ..Y.
      `,
    },
    pebbles: {
      on: "lower",
      density: 0.1,
      grid: `
        .kk...
        kkkK..
        .KK.kk
        ....KK
      `,
    },
  },
});
