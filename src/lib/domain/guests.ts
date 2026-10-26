import type { Guest } from "./schema";

/** People counted by reply, across every invitation. */
export interface RsvpSummary {
  invitations: number;
  people: number;
  yes: number;
  no: number;
  pending: number;
  /** Everyone who hasn't declined: the most who could come. */
  expected: number;
}

export function summariseRsvps(guests: Guest[]): RsvpSummary {
  const count = (rsvp: Guest["rsvp"]) => guests.filter((g) => g.rsvp === rsvp).reduce((sum, g) => sum + g.partySize, 0);
  const [yes, no, pending] = [count("yes"), count("no"), count("pending")];
  return { invitations: guests.length, people: yes + no + pending, yes, no, pending, expected: yes + pending };
}
