import { describe, expect, it } from "vitest";
import { TODAY, weddingBrief } from "./fixtures.test-helpers";
import { createPlan } from "./plan";
import { type Guest } from "./schema";
import { summariseRsvps, addGuest, removeGuest, setRsvp } from "./guests";

const guest = (name: string, partySize: number, rsvp: Guest["rsvp"]): Guest => ({ id: name, name, partySize, rsvp });

describe("summariseRsvps", () => {
  it("counts people, not invitations, by reply", () => {
    expect(
      summariseRsvps([
        guest("The Sharmas", 4, "yes"),
        guest("Priya", 1, "no"),
        guest("The Iyers", 3, "pending"),
        guest("Ravi's team", 6, "yes"),
      ]),
    ).toEqual({ invitations: 4, people: 14, yes: 10, no: 1, pending: 3, expected: 13 });
  });

  it("is all zeros for an empty list", () => {
    expect(summariseRsvps([])).toEqual({ invitations: 0, people: 0, yes: 0, no: 0, pending: 0, expected: 0 });
  });
});

describe("guest list", () => {
  const sharmas: Guest = { id: "g1", name: "The Sharmas", partySize: 4, rsvp: "pending" };
  const iyers: Guest = { id: "g2", name: "The Iyers", partySize: 3, rsvp: "pending" };

  it("starts empty", () => {
    expect(createPlan(weddingBrief(), TODAY).guests).toEqual([]);
  });

  it("adds invitations, records one reply, and removes one", () => {
    let plan = addGuest(addGuest(createPlan(weddingBrief(), TODAY), sharmas), iyers);
    plan = setRsvp(plan, "g1", "yes");
    expect(plan.guests).toEqual([{ ...sharmas, rsvp: "yes" }, iyers]);
    expect(removeGuest(plan, "g1").guests).toEqual([iyers]);
  });

  it.each([[{ name: "  " }], [{ partySize: 0 }], [{ partySize: 51 }], [{ partySize: 1.5 }]])(
    "refuses an invitation the plan couldn't hold: %o",
    (overrides) => {
      expect(() => addGuest(createPlan(weddingBrief(), TODAY), { ...sharmas, ...overrides })).toThrow(
        "An invitation needs a name and a party size from 1 to 50.",
      );
    },
  );
});
