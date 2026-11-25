import { MOVE_MAX, type MoveInput } from "./movement.ts";

/**
 * Client to MapRoom messages (PLAN §21). Each carries a Standard Schema validator, which the room
 * checks before a handler runs: a message that fails it gets the client dropped.
 */

/** The shape Colyseus accepts as a message schema (standardschema.dev, version 1). */
export interface MessageSchema<Out> {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown,
    ) =>
      | { readonly value: Out; readonly issues?: undefined }
      | { readonly issues: readonly { readonly message: string }[] };
    readonly types?: { readonly input: Out; readonly output: Out };
  };
}

function messageSchema<Out>(check: (value: unknown) => Out | string): MessageSchema<Out> {
  return {
    "~standard": {
      version: 1,
      vendor: "guago",
      validate(value) {
        const out = check(value);
        return typeof out === "string" ? { issues: [{ message: out }] } : { value: out };
      },
    },
  };
}

/** Largest input sequence number: three years of input at 20 a second. */
export const MAX_INPUT_SEQ = 0x7fffffff;

/**
 * `input`: one tick of movement, sent as `[seq, mx, my]`, or `[seq, mx, my, flags]` with a dodge
 * or a manual cast (`fight/body.ts` `InputFlag`). Only ticks with a direction, a flag or a roll
 * under way are sent.
 */
export const INPUT_MESSAGE = "input";
export type InputMessage =
  | readonly [seq: number, mx: number, my: number]
  | readonly [seq: number, mx: number, my: number, flags: number];

/** Highest flags value: dodge (1) and a cast slot of 1 to 6 in bits 1 to 3. */
export const MAX_INPUT_FLAGS = 15;

const isAxis = (v: unknown): v is number =>
  Number.isInteger(v) && Math.abs(v as number) <= MOVE_MAX;

export const inputMessage = messageSchema<MoveInput & { readonly flags?: number }>((value) => {
  if (!Array.isArray(value) || value.length < 3 || value.length > 4) {
    return "input is [seq, mx, my] or [seq, mx, my, flags]";
  }
  const [seq, mx, my, flags] = value as unknown[];
  if (!Number.isInteger(seq) || (seq as number) < 1 || (seq as number) > MAX_INPUT_SEQ) {
    return "input seq is a whole number from 1";
  }
  if (!isAxis(mx) || !isAxis(my)) return `input axes are whole numbers within ±${MOVE_MAX}`;
  if (flags === undefined) return { seq: seq as number, mx, my };
  if (!Number.isInteger(flags) || (flags as number) < 0 || (flags as number) > MAX_INPUT_FLAGS) {
    return `input flags are a whole number from 0 to ${MAX_INPUT_FLAGS}`;
  }
  return { seq: seq as number, mx, my, flags: flags as number };
});

export function encodeInput(input: MoveInput & { readonly flags?: number }): InputMessage {
  return input.flags
    ? [input.seq, input.mx, input.my, input.flags]
    : [input.seq, input.mx, input.my];
}

/** Largest aim offset accepted, px. */
export const MAX_AIM = 400;

/** `aim`: where the player points, `[dx, dy]` px from its feet; `[]` lets the server aim. */
export const AIM_MESSAGE = "aim";
export const aimMessage = messageSchema<{ readonly dx: number; readonly dy: number } | null>(
  (value) => {
    if (!Array.isArray(value)) return "aim is [dx, dy] or []";
    if (value.length === 0) return null;
    const [dx, dy] = value as unknown[];
    const ok = (v: unknown) => Number.isInteger(v) && Math.abs(v as number) <= MAX_AIM;
    if (value.length !== 2 || !ok(dx) || !ok(dy)) return `aim is whole px within ±${MAX_AIM}`;
    return { dx: dx as number, dy: dy as number };
  },
);

/** `mode`: `[index]` into `CONTROL_MODES`. */
export const MODE_MESSAGE = "mode";
export const modeMessage = messageSchema<number>((value) => {
  if (!Array.isArray(value) || value.length !== 1) return "mode is [index]";
  const [m] = value as unknown[];
  if (!Number.isInteger(m) || (m as number) < 0 || (m as number) > 3) return "mode is 0 to 3";
  return m as number;
});

/** `revive`: `[slot]` of the downed player to channel on. */
export const REVIVE_MESSAGE = "revive";
export const reviveMessage = messageSchema<number>((value) => {
  if (!Array.isArray(value) || value.length !== 1) return "revive is [slot]";
  const [slot] = value as unknown[];
  if (!Number.isInteger(slot) || (slot as number) < 0 || (slot as number) > 255) {
    return "revive slot is a whole number";
  }
  return slot as number;
});

/** Client to the map room: `[bossId]`, fight a boss the server freed again, alone (복습, PLAN §10). */
export const REPLAY_MESSAGE = "replay";
export const replayMessage = messageSchema<{ readonly boss: string }>((value) => {
  if (!Array.isArray(value) || value.length !== 1) return "replay is [boss]";
  const [boss] = value as unknown[];
  if (typeof boss !== "string" || !/^[a-z][a-z-]{0,31}$/.test(boss)) return "replay boss is an id";
  return { boss };
});
