/**
 * Rules no player may ever see broken, checked where the check is cheap, in development and
 * tests only. A break is logged and kept; tests fail on any (`invariants.broken`).
 */
export const invariants = {
  on: process.env.NODE_ENV !== "production",
  broken: [] as string[],
  report(what: string): void {
    this.broken.push(what);
    console.error(`invariant broken: ${what}`);
  },
};
