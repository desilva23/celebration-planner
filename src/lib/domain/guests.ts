import { PlanError, stamp } from "./plan";
import { GuestSchema, type Guest, type Plan, type Rsvp } from "./schema";

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

export function addGuest(plan: Plan, guest: Guest, now: Date = new Date()): Plan {
  if (!GuestSchema.safeParse(guest).success) {
    throw new PlanError("An invitation needs a name and a party size from 1 to 50.");
  }
  return stamp({ ...plan, guests: [...plan.guests, guest] }, now);
}

export function setRsvp(plan: Plan, guestId: string, rsvp: Rsvp, now: Date = new Date()): Plan {
  return stamp({ ...plan, guests: plan.guests.map((g) => (g.id === guestId ? { ...g, rsvp } : g)) }, now);
}

export function removeGuest(plan: Plan, guestId: string, now: Date = new Date()): Plan {
  return stamp({ ...plan, guests: plan.guests.filter((g) => g.id !== guestId) }, now);
}
