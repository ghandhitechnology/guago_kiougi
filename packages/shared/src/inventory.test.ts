import { describe, expect, it } from "vitest";
import { isFinalResult, type OpResult, ResultLog } from "./inventory.ts";

const ok: OpResult = { id: "op-00000001", op: "craft", ok: true, outcome: {}, change: { rev: 2 } };
const limited: OpResult = {
  id: "op-00000001",
  op: "craft",
  ok: false,
  error: "rate_limited",
  retryMs: 400,
};
const refused: OpResult = { id: "op-00000002", op: "pilgi", ok: false, error: "pilgi_cost" };

describe("operation results on the client", () => {
  it("treats answers the server never records as not final", () => {
    expect(isFinalResult(ok)).toBe(true);
    expect(isFinalResult(refused)).toBe(true);
    expect(isFinalResult(limited)).toBe(false);
    expect(isFinalResult({ ...limited, error: "server_error" })).toBe(false);
  });

  it("lets the result of a retried id through after a non-final answer, and drops replays", () => {
    const log = new ResultLog();
    expect(log.admit(limited)).toBe(true);
    expect(log.admit(ok)).toBe(true);
    expect(log.admit(ok)).toBe(false);
    expect(log.admit(refused)).toBe(true);
    expect(log.admit(refused)).toBe(false);
  });
});
