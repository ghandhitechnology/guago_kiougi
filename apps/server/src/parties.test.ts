import { beforeEach, describe, expect, it } from "vitest";
import { type PartyPerson, parties } from "./parties.ts";

const person = (id: string): PartyPerson => ({ id, name: id, major: "math", level: 1 });

describe("the party lead", () => {
  beforeEach(() => parties.reset());

  it("never goes to a member who is offline", () => {
    const [a, b, c] = [person("a"), person("b"), person("c")];
    expect(parties.invite(a, b, true, 0)).toBeNull();
    expect(parties.accept(b, parties.of("a")?.id ?? 0, 0)).toBeNull();
    expect(parties.invite(a, c, true, 0)).toBeNull();
    expect(parties.accept(c, parties.of("a")?.id ?? 0, 0)).toBeNull();
    parties.offline("b", 0);
    expect(parties.lead("a", "b")).toBe("target_offline");
    expect(parties.of("a")?.leader).toBe("a");
    expect(parties.lead("a", "c")).toBeNull();
    expect(parties.of("a")?.leader).toBe("c");
  });
});
