/**
 * What the scenes staged on a map draw with, so it loads with the map like its own people: the
 * scenes' cast, the students who fill a room, and the sprites of the effects they play.
 */
import type { ArtMetadata } from "@guago/art";
import { actorArt, type BuiltMap, type narrative, SCENES, stageMapOf } from "@guago/content";

/** Sprites each effect draws (`fx.ts`). */
const FX_SPRITES: Partial<Record<narrative.Effect, readonly string[]>> = {
  "page-gust": ["pickup-page", "page-s", "fx-pickup"],
  "book-glow": ["fx-book", "fx-levelup"],
  "odap-surge": ["odap", "odap-pencil", "fx-death-paper"],
  "fault-crack": ["fx-fault"],
  "columns-rise": ["fx-dust"],
  "golem-rise": ["golem", "fx-dust"],
  "drop-pop": ["drop-page-math", "drop-glint", "fx-pop", "fx-pickup"],
  "diagonal-glow": ["p1-diagonal"],
  "grid-dissolve": ["fx-debris-paper"],
  "limit-rings": ["p1-limit-96", "p1-limit-48", "p1-limit-24"],
  "dash-arrive": ["fx-dodge-streak", "fx-shockwave"],
  "ice-spread": ["p1-ice"],
  "block-slide": ["fx-dust"],
  "theory-break": ["boss-aristotle-shield", "fx-shard"],
  "two-stones": ["p1-boulder", "fx-dust"],
  "page-return": ["pickup-page", "fx-levelup"],
};

/** The rig the room fills are drawn with (`extras.ts`). */
const FILL_RIG = "student";
const FILLED = new Set(["opening-b1", "opening-b7"]);

export function storyAtlases(meta: ArtMetadata, map: BuiltMap): string[] {
  const out = new Set<string>();
  const add = (atlas: string | undefined) => {
    if (atlas) out.add(atlas);
  };
  for (const scene of SCENES) {
    if (stageMapOf([map], scene.map) !== map) continue;
    for (const id of scene.cast) {
      const art = actorArt(scene.id, id);
      add(art?.kind === "rig" ? meta.rigs[art.art]?.atlas : meta.sprites[art?.art ?? ""]?.atlas);
    }
    if (FILLED.has(scene.id)) add(meta.rigs[FILL_RIG]?.atlas);
    for (const step of scene.steps) {
      if (step.do !== "fx") continue;
      for (const name of FX_SPRITES[step.fx] ?? []) add(meta.sprites[name]?.atlas);
    }
  }
  return [...out];
}
