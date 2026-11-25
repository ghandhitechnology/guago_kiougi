/**
 * Club EXP from member activity (PLAN §12 club level). Activity sources (kills, 수행평가, the weekly
 * club boss) arrive later and call `clubActivity.add` from anywhere in the process; the WorldRoom
 * credits the total to each character's club once a minute, so a busy field never writes per kill.
 */
class ClubActivity {
  private pending = new Map<string, number>();

  add(characterId: string, exp: number): void {
    if (!(exp > 0) || !Number.isFinite(exp)) return;
    this.pending.set(characterId, (this.pending.get(characterId) ?? 0) + exp);
  }

  /** Everything added since the last call, by character. */
  take(): Map<string, number> {
    const taken = this.pending;
    this.pending = new Map();
    return taken;
  }
}

export const clubActivity = new ClubActivity();
