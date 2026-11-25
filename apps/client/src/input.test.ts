import { MOVE_MAX } from "@guago/shared";
import { describe, expect, it } from "vitest";
import { KeyboardMove, type KeySource } from "./input.ts";

function keyboard() {
  const target = new EventTarget() as EventTarget & { document: EventTarget & { hidden: boolean } };
  target.document = Object.assign(new EventTarget(), { hidden: false });
  const press = (type: "keydown" | "keyup", code: string) =>
    target.dispatchEvent(
      Object.assign(new Event(type, { cancelable: true }), { code, repeat: false }),
    );
  return { move: new KeyboardMove(target as unknown as KeySource), press };
}

describe("keyboard movement", () => {
  it("counts a quick opposite tap between two samples ahead of the key held before it", () => {
    const { move, press } = keyboard();
    press("keydown", "KeyD");
    expect(move.sample()).toEqual([MOVE_MAX, 0]);
    press("keydown", "KeyA");
    press("keyup", "KeyA");
    expect(move.sample()).toEqual([-MOVE_MAX, 0]);
    expect(move.sample()).toEqual([MOVE_MAX, 0]);
  });

  it("lets the key pressed last win while both are held", () => {
    const { move, press } = keyboard();
    press("keydown", "ArrowLeft");
    press("keydown", "KeyD");
    expect(move.sample()).toEqual([MOVE_MAX, 0]);
    press("keyup", "KeyD");
    expect(move.sample()).toEqual([-MOVE_MAX, 0]);
  });
});
