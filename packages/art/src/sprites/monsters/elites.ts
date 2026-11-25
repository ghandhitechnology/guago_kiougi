import type { SpriteDef } from "../../format.ts";
import { elite } from "../../forms.ts";
import elements from "./element.ts";
import odaps from "./odap.ts";
import rational from "./rational.ts";
import shadows from "./shadow.ts";

/**
 * 심화 elites (PLAN §6): every 200 kills a field promotes one roster monster. The client draws an
 * elite at twice the size and names it `<sprite>-elite`; each wears a gold crown with a red-pen
 * gem over its head in every frame, and its eyes burn. The tortoise and the pebble are never
 * promoted, so they have none.
 */
const by = (list: readonly SpriteDef[], name: string): SpriteDef => {
  const found = list.find((s) => s.name === name);
  if (!found) throw new Error(`no monster ${name}`);
  return found;
};

export default [
  elite(by(odaps, "odap"), { palette: { "*": "gold.pale" } }),
  elite(by(odaps, "odap-pencil"), { palette: { "*": "red.light" } }),
  elite(rational, {
    ignore: ["wood.deep", "wood.mid", "wood.light", "stone.deep", "stone.light", "stone.bright"],
    palette: { e: "red.light" },
  }),
  elite(by(elements, "element-fire"), {}),
  elite(by(elements, "element-water"), { palette: { "*": "red.dark" } }),
  elite(by(elements, "element-air"), { palette: { "*": "red.dark" } }),
  elite(by(elements, "element-earth"), { palette: { "*": "red.dark" } }),
  elite(by(shadows, "cave-shadow"), {
    palette: { G: "red.light" },
    seats: { aim0: [8, 4], aim1: [8, 5] },
  }),
];
