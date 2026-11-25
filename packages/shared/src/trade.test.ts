import { describe, expect, it } from "vitest";
import { Random } from "./random.ts";
import { purchaseTax, saleTax } from "./trade.ts";

describe("the 매점 게시판 sale tax", () => {
  it("is the same however a listing is split into purchases", () => {
    const random = new Random(11);
    for (let round = 0; round < 2000; round++) {
      const unit = BigInt(1 + random.int(round % 3 === 0 ? 30 : 100_000));
      const qty = 1 + random.int(300);
      let left = qty;
      let sold = 0n;
      let taxed = 0n;
      let proceeds = 0n;
      while (left > 0) {
        const take = 1 + random.int(Math.min(left, round % 2 ? 1 : 40));
        const total = unit * BigInt(take);
        const tax = purchaseTax(sold, total);
        expect(tax >= 0n && tax <= total).toBe(true);
        taxed += tax;
        proceeds += total - tax;
        sold += total;
        left -= take;
      }
      const whole = unit * BigInt(qty);
      expect(taxed).toBe(saleTax(whole));
      expect(proceeds).toBe(whole - saleTax(whole));
    }
  });
});
