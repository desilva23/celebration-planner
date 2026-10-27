import { describe, expect, it } from "vitest";
import { summariseRsvps } from "./guests";
import type { Guest } from "./schema";

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
