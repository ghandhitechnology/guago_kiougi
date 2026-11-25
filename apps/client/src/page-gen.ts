/**
 * This page's generation (`Entry.gen`): handed out by its first entry, presented on every entry
 * and WorldRoom join after it. A page a newer page of the account replaced is told so even when
 * it never heard the close (its socket was down), and never takes the seat back.
 */
let gen: number | undefined;

export const pageGen = {
  get: (): number | undefined => gen,
  set(g: number): void {
    gen = g;
  },
};
