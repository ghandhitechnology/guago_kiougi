/**
 * What the opening's fights (`opening/`) ask of the story director: which `play` condition a
 * character's scene waits on next, and that a fight met it. A fight starts only when the scene
 * waits on it and signals only what it waits on, so with no hooks provided nothing runs.
 *
 * The story director provides them once at server start, as one line in `index.ts` right after
 * `story.provide(...)`:
 *
 *   provideStoryHooks({ waitingOn: (c) => story.waitingOn(c), signal: (c, u) => story.signal(c, u) });
 */

export interface StoryHooks {
  /** The `play` condition the character's scene waits on next, if they are in one. */
  waitingOn(characterId: string): string | undefined;
  /** A fight met `until` for the character; ignored unless the scene waits on exactly it next. */
  signal(characterId: string, until: string): void;
}

let hooks: StoryHooks | undefined;

export function provideStoryHooks(h: StoryHooks | undefined): void {
  hooks = h;
}

export function storyHooks(): StoryHooks | undefined {
  return hooks;
}

/**
 * Signals, in the scene's order, every condition it waits on that `met` says a fight has met,
 * and stops at the first it has not: a fight that met several in one tick meets them all.
 */
export function meetWhile(
  h: StoryHooks,
  characterId: string,
  met: (until: string) => boolean,
): void {
  for (let i = 0; i < 8; i++) {
    const until = h.waitingOn(characterId);
    if (until === undefined || !met(until)) return;
    h.signal(characterId, until);
    if (h.waitingOn(characterId) === until) return;
  }
}
