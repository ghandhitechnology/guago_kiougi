/**
 * Where each character stands, shared in-process between the map rooms and the WorldRoom
 * (PLAN §19: one Node process). A map room enters a character on join and leaves it on leave;
 * positions are read on demand through `at`, so the map loop pays nothing per tick.
 */

export interface Place {
  mapId: string;
  /** The map room instance; 주변 reaches only players in the same one. */
  roomId: string;
  /** The character's session in that room. */
  sessionId: string;
  /** Current position in world pixels, or undefined once gone. */
  at: () => { x: number; y: number } | undefined;
}

type Listener = (characterId: string, mapId: string) => void;

class Places {
  private readonly byCharacter = new Map<string, Place>();
  private readonly listeners = new Set<Listener>();

  enter(characterId: string, place: Place): void {
    const before = this.byCharacter.get(characterId);
    this.byCharacter.set(characterId, place);
    if (before?.mapId !== place.mapId) this.emit(characterId, place.mapId);
  }

  /** Ignored when the character has since entered another room (the newer seat owns it). */
  leave(sessionId: string): void {
    for (const [characterId, place] of this.byCharacter) {
      if (place.sessionId !== sessionId) continue;
      this.byCharacter.delete(characterId);
      this.emit(characterId, "");
      return;
    }
  }

  get(characterId: string): Place | undefined {
    return this.byCharacter.get(characterId);
  }

  /** Characters in the same map room within `radius` pixels of this one, itself included. */
  near(characterId: string, radius: number): { characterId: string; place: Place }[] {
    const here = this.byCharacter.get(characterId);
    const origin = here?.at();
    if (!here || !origin) return [];
    const found: { characterId: string; place: Place }[] = [];
    for (const [id, place] of this.byCharacter) {
      if (place.roomId !== here.roomId) continue;
      const p = place.at();
      if (p && Math.hypot(p.x - origin.x, p.y - origin.y) <= radius) {
        found.push({ characterId: id, place });
      }
    }
    return found;
  }

  /** Called with the new map id (empty when the character left every map). */
  listen(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(characterId: string, mapId: string): void {
    for (const listener of this.listeners) listener(characterId, mapId);
  }
}

export const places = new Places();
