import { audio, type HitClass } from "@guago/audio";

/** Kills within this window keep a streak going, seconds. */
const STREAK_WINDOW = 3;
/** Kills in a streak before the music answers. */
const STREAK_LOUD = 12;

/**
 * The fight's sound, through the game's one mixer (`@guago/audio`): every hit event goes to its
 * hit mixer, which layers body, material and sweetener and keeps to 8 voices; cues are placed
 * relative to the listener; the field music follows the waves and the player's kill streak.
 */
export class FightSound {
  private streak = 0;
  private lastKill = -1e9;
  private loud = false;
  private surge = true;
  private music = false;
  /** Listener position: the local player. */
  lx = 0;
  ly = 0;

  /**
   * `field`: the map's song (the soundscape plays it) follows the waves and the kill streak
   * through its stems. A town leaves the song alone.
   */
  start(field: boolean): void {
    audio.unlock();
    audio.preload("combat");
    if (field) audio.preload("page1");
    this.music = field;
    this.restem(2);
  }

  hit(
    cls: HitClass,
    own: boolean,
    x: number,
    y: number,
    flags: { heavy: boolean; crit: boolean; kill: boolean },
    impact: string,
    material: string,
    death: string,
  ): void {
    audio.hit({
      cls,
      own,
      heavy: flags.heavy,
      crit: flags.crit,
      kill: flags.kill,
      impact,
      material,
      death,
      dx: x - this.lx,
      dy: y - this.ly,
    });
  }

  cue(name: string, x: number, y: number, own = true, pitch?: number): void {
    audio.cue(name, {
      own,
      dx: x - this.lx,
      dy: y - this.ly,
      ...(pitch !== undefined ? { pitch } : {}),
    });
  }

  /** A sound on the player, unplaced. */
  self(name: string, pitch?: number): void {
    audio.cue(name, pitch !== undefined ? { pitch } : {});
  }

  proof(stack: number): void {
    audio.proof(stack);
  }

  /**
   * Several kills in one snapshot: one crit of the class, pitched up a whole tone for each kill
   * past the third and again for each multi-kill in a row, so a run of them climbs.
   */
  multiKill(cls: string, kills: number, combo: number, x: number, y: number): void {
    const pitch = Math.min(14, 2 * (kills - 3) + 2 * Math.min(4, combo));
    this.cue(`hit.${cls}.crit`, x, y, true, pitch);
    if (kills >= 6) this.cue(`hit.${cls}.heavy`, x, y, true, -5);
  }

  /** The kill streak passed a mark: the class's crit an octave up, climbing with each mark. */
  streakMark(cls: string, step: number): void {
    this.self(`hit.${cls}.crit`, Math.min(19, 7 + step * 3));
    this.self(`hit.${cls}.heavy`, -7);
  }

  collide(link: number, x: number, y: number): void {
    audio.collide(link, { dx: x - this.lx, dy: y - this.ly });
  }

  forecast(delaySeconds: number, x: number, y: number, own: boolean): void {
    audio.forecast({ delay: delaySeconds, own, dx: x - this.lx, dy: y - this.ly });
  }

  /** One of the player's kills; a long run brings the surge band in at full. */
  kill(nowMs: number): void {
    if (nowMs - this.lastKill > STREAK_WINDOW * 1000) this.streak = 0;
    this.streak++;
    this.lastKill = nowMs;
    if (!this.loud && this.streak >= STREAK_LOUD) {
      this.loud = true;
      this.restem(0.6);
    }
  }

  get killStreak(): number {
    return this.streak;
  }

  update(nowMs: number): void {
    if (this.loud && nowMs - this.lastKill > STREAK_WINDOW * 1000) {
      this.loud = false;
      this.streak = 0;
      this.restem(2.5);
    }
  }

  /** The wave turned: a surge brings the drums back, 쉬는 시간 thins the band to the lyre. */
  phase(surge: boolean): void {
    if (this.surge === surge) return;
    this.surge = surge;
    this.restem(surge ? 0.4 : 1.6);
  }

  private stems(): Record<string, number> {
    if (!this.surge) return { melody: 0.65, drive: 0.25, surge: 0 };
    return { melody: 1, drive: 1, surge: this.loud ? 1 : 0.45 };
  }

  private restem(fade: number): void {
    if (!this.music) return;
    for (const [name, level] of Object.entries(this.stems())) audio.stem(name, level, fade);
  }

  /** The song's stems back to full, for whatever plays next. */
  stop(): void {
    if (!this.music) return;
    for (const name of Object.keys(this.stems())) audio.stem(name, 1, 1.5);
    this.music = false;
  }
}
