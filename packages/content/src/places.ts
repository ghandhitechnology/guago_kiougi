/**
 * The story's place ids (narrative `where`, codex `visited`, notices) for the maps and rooms
 * that are those places. A map or room whose id already is the story's id needs no entry.
 */
export const STORY_PLACES: Readonly<Record<string, string>> = {
  "gaseolgwan-stairs": "gaseolgwan",
  "gaseol-1f": "gaseolgwan",
  "gaseol-2f": "gaseolgwan",
  "gaseol-4f": "gaseolgwan",
  saebyeok: "dawn-hall",
  silheom: "lab-building",
  "campus-field": "field",
};

/** A map or room id, and the story's id for it when that differs. */
export function storyPlaces(id: string): string[] {
  const alias = STORY_PLACES[id];
  return alias && alias !== id ? [id, alias] : [id];
}
