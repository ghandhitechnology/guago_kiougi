/**
 * The club each character wears under its name (PLAN §12 과잠, §16 characters), shared
 * in-process with the map rooms the way `places` is. The WorldRoom sets a character's tag when
 * it joins and whenever its club or the club's look changes; a map room copies the tag onto the
 * synced player when a body is handed out and again on each change, so an idle map pays nothing.
 */

export interface ClubTag {
  id: number;
  name: string;
  /** A `jacket` swap slot option. */
  jacket: string;
  /** `encodeEmblem` form. */
  emblem: string;
}

type Listener = (characterId: string, tag: ClubTag | undefined) => void;

const same = (a: ClubTag | undefined, b: ClubTag | undefined) =>
  a === b ||
  (a !== undefined &&
    b !== undefined &&
    a.id === b.id &&
    a.name === b.name &&
    a.jacket === b.jacket &&
    a.emblem === b.emblem);

class ClubTags {
  private readonly tags = new Map<string, ClubTag>();
  private readonly listeners = new Set<Listener>();

  get(characterId: string): ClubTag | undefined {
    return this.tags.get(characterId);
  }

  set(characterId: string, tag: ClubTag | undefined): void {
    if (same(this.tags.get(characterId), tag)) return;
    if (tag) this.tags.set(characterId, tag);
    else this.tags.delete(characterId);
    for (const listener of this.listeners) listener(characterId, tag);
  }

  listen(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const clubTags = new ClubTags();
