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

/** `input`: one tick of movement, sent as `[seq, mx, my]`. Only ticks with a direction are sent. */
export const INPUT_MESSAGE = "input";
export type InputMessage = readonly [seq: number, mx: number, my: number];

const isAxis = (v: unknown): v is number =>
  Number.isInteger(v) && Math.abs(v as number) <= MOVE_MAX;

export const inputMessage = messageSchema<MoveInput>((value) => {
  if (!Array.isArray(value) || value.length !== 3) return "input is [seq, mx, my]";
  const [seq, mx, my] = value as unknown[];
  if (!Number.isInteger(seq) || (seq as number) < 1 || (seq as number) > MAX_INPUT_SEQ) {
    return "input seq is a whole number from 1";
  }
  if (!isAxis(mx) || !isAxis(my)) return `input axes are whole numbers within ±${MOVE_MAX}`;
  return { seq: seq as number, mx, my };
});

export function encodeInput(input: MoveInput): InputMessage {
  return [input.seq, input.mx, input.my];
}
