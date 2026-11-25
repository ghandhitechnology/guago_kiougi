import type { ToolDef } from "./attacks.ts";
import type { BookDef } from "./book-def.ts";
import { BIOLOGY_BOOKS } from "./books-biology.ts";
import { CHEMISTRY_BOOKS } from "./books-chemistry.ts";
import { EARTH_BOOKS } from "./books-earth.ts";
import { MATH_BOOKS } from "./books-math.ts";
import { PHYSICS_BOOKS } from "./books-physics.ts";
import type { ClassId } from "./classes.ts";
import { TOOLS } from "./tools.ts";

export type { BookCues, BookDef, Evolution, SignatureTuning } from "./book-def.ts";
export * from "./books-biology.ts";
export * from "./books-chemistry.ts";
export * from "./books-earth.ts";
export * from "./books-math.ts";
export * from "./books-physics.ts";
export { TOOLS } from "./tools.ts";

/** The thirty launch books of PLAN §8, six per class in the PLAN's order. */
export const BOOKS: readonly BookDef[] = [
  ...MATH_BOOKS,
  ...PHYSICS_BOOKS,
  ...CHEMISTRY_BOOKS,
  ...BIOLOGY_BOOKS,
  ...EARTH_BOOKS,
] as readonly BookDef[];

export function booksOf(subject: ClassId): readonly BookDef[] {
  return BOOKS.filter((b) => b.subject === subject);
}

export function bookById(id: string): BookDef {
  const found = BOOKS.find((b) => b.id === id);
  if (!found) throw new Error(`unknown book ${id}`);
  return found;
}

export function toolById(id: string): ToolDef {
  const found = TOOLS.find((t) => t.id === id);
  if (!found) throw new Error(`unknown tool ${id}`);
  return found;
}
