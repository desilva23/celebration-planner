"use client";

import { useState, type SubmitEvent } from "react";
import { newId } from "@/lib/client/api";
import { summariseRsvps } from "@/lib/domain/guests";
import { addGuest, applyChange, PlanError, removeGuest, setRsvp } from "@/lib/domain/plan";
import type { Guest, Rsvp } from "@/lib/domain/schema";
import type { PanelProps } from "./PlanDashboard";
import { ErrorMessage, Section } from "./ui";

const RSVP_LABEL: Record<Rsvp, string> = { pending: "Yet to reply", yes: "Coming", no: "Not coming" };
const RSVPS: Rsvp[] = ["pending", "yes", "no"];

export function GuestsPanel({ plan, today, onChange, onUpdate }: PanelProps) {
  const rsvps = summariseRsvps(plan.guests);
  const [headcountError, setHeadcountError] = useState<string | null>(null);
  const suggestHeadcount = rsvps.expected > 0 && rsvps.expected !== plan.brief.guestCount;

  /** RSVPs change the plan through the same engine as any other headcount change. */
  function planFor(guestCount: number) {
    try {
      onUpdate(applyChange(plan, { guestCount }, today), "Plan revised");
      setHeadcountError(null);
    } catch (error) {
      setHeadcountError(error instanceof PlanError ? error.message : "The headcount couldn't be changed.");
    }
  }

  function invite(guest: Guest): string | null {
    try {
      onChange(addGuest(plan, guest));
      return null;
    } catch (error) {
      return error instanceof PlanError ? error.message : "Couldn't add the invitation.";
    }
  }

  return (
    <Section
      id="guests"
      title="Guests"
      intro="Keep track of who’s invited and who’s coming. The plan’s headcount drives catering and invitation costs."
    >
      {rsvps.invitations === 0 ? (
        <p className="hint">No invitations yet. Add households or groups below as you invite them.</p>
      ) : (
        <>
          <p>
            {rsvps.invitations} {rsvps.invitations === 1 ? "invitation" : "invitations"} for {rsvps.people} people:{" "}
            {rsvps.yes} coming, {rsvps.no} not coming, {rsvps.pending} yet to reply.
          </p>
          {suggestHeadcount && (
            <div className="callout info">
              <p>
                Your plan is for {plan.brief.guestCount} guests. Up to {rsvps.expected} could come, counting everyone
                who hasn’t said no.
              </p>
              <button type="button" className="button secondary" onClick={() => planFor(rsvps.expected)}>
                Plan for {rsvps.expected} guests
              </button>
            </div>
          )}
          {headcountError && <ErrorMessage>{headcountError}</ErrorMessage>}
          <div className="table-wrap">
            <table>
              <caption className="visually-hidden">Invitations and replies</caption>
              <thead>
                <tr>
                  <th scope="col">Invitation</th>
                  <th scope="col">People</th>
                  <th scope="col">Reply</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {plan.guests.map((guest) => (
                  <tr key={guest.id}>
                    <th scope="row">{guest.name}</th>
                    <td>{guest.partySize}</td>
                    <td>
                      <select
                        aria-label={`Reply from ${guest.name}`}
                        value={guest.rsvp}
                        onChange={(e) => onChange(setRsvp(plan, guest.id, e.target.value as Rsvp))}
                      >
                        {RSVPS.map((rsvp) => (
                          <option key={rsvp} value={rsvp}>
                            {RSVP_LABEL[rsvp]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="button ghost small"
                        onClick={() =>
                          onUpdate(
                            { plan: removeGuest(plan, guest.id), effects: [] },
                            `${guest.name} removed from the guest list`,
                          )
                        }
                      >
                        Remove <span className="visually-hidden">{guest.name}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <AddGuest onAdd={invite} />
    </Section>
  );
}

function AddGuest({ onAdd }: { onAdd: (guest: Guest) => string | null }) {
  const [name, setName] = useState("");
  const [partySize, setPartySize] = useState("2");
  const [problem, setProblem] = useState<string | null>(null);

  function submit(event: SubmitEvent) {
    event.preventDefault();
    // The plan validates the invitation and explains anything it refuses.
    const refused = onAdd({
      id: newId(),
      name: name.trim(),
      partySize: Math.round(Number(partySize)),
      rsvp: "pending",
    });
    setProblem(refused);
    if (refused) return;
    setName("");
    setPartySize("2");
  }

  return (
    <form onSubmit={submit} className="inline-form subsection" noValidate>
      <label htmlFor="guest-name">Invitation (household or group)</label>
      <input id="guest-name" type="text" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      <label htmlFor="guest-party">People</label>
      <input
        id="guest-party"
        type="number"
        inputMode="numeric"
        min={1}
        max={50}
        value={partySize}
        onChange={(e) => setPartySize(e.target.value)}
      />
      <button type="submit" className="button secondary">
        Add invitation
      </button>
      {problem && <ErrorMessage>{problem}</ErrorMessage>}
    </form>
  );
}
