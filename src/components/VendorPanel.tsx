"use client";

import { useState, type SubmitEvent } from "react";
import type { CompareQuotesResult, QuoteSummary, VendorBriefResult } from "@/lib/ai/contracts";
import { newId, useAiCall } from "@/lib/client/api";
import { formatInr } from "@/lib/domain/format";
import { bookVendor, cancelBooking, PlanError, removeVendor, upsertVendor, type PlanUpdate } from "@/lib/domain/plan";
import type { CategoryId, Plan, Vendor } from "@/lib/domain/schema";
import type { PanelProps } from "./PlanDashboard";
import { categoryLabel, ErrorMessage, Provenance, Section } from "./ui";

export function VendorPanel({ plan, onChange, onUpdate }: PanelProps) {
  const categories = plan.budget.map((l) => l.category).filter((c) => c !== "contingency");
  const [category, setCategory] = useState<CategoryId>(categories[0] ?? "venue");
  const [bookingError, setBookingError] = useState<string | null>(null);
  const line = plan.budget.find((l) => l.category === category);
  const vendors = plan.vendors.filter((v) => v.category === category);

  /** The plan can refuse a booking change (no quote yet, for example); say why. */
  function changeBooking(change: () => PlanUpdate, heading: string) {
    try {
      onUpdate(change(), heading);
      setBookingError(null);
    } catch (error) {
      setBookingError(error instanceof PlanError ? error.message : "Couldn't update the booking.");
    }
  }

  return (
    <Section
      id="vendors"
      title="Vendors"
      intro="Only vendors you have actually contacted go here. The planner never invents businesses, prices or availability."
    >
      <div className="field inline">
        <label htmlFor="vendor-category">Vendor type</label>
        <select id="vendor-category" value={category} onChange={(e) => setCategory(e.target.value as CategoryId)}>
          {categories.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
        </select>
        {line && (
          <span className="hint">
            Planned: {formatInr(line.amount)} ({line.source === "confirmed" ? "confirmed" : "estimate"})
          </span>
        )}
      </div>

      <VendorBrief key={`brief-${category}`} plan={plan} category={category} budgetForCategory={line?.amount ?? 0} />

      <h3>Your {categoryLabel(category).toLowerCase()} vendors</h3>
      {bookingError && <ErrorMessage>{bookingError}</ErrorMessage>}
      {vendors.length === 0 ? (
        <p className="hint">None yet. Add one below once you’ve been in touch.</p>
      ) : (
        <ul className="vendor-list">
          {vendors.map((vendor) => (
            <VendorRow
              key={`${vendor.id}-${vendor.quote}-${vendor.status}`}
              vendor={vendor}
              onSave={(v) => onChange(upsertVendor(plan, v))}
              onBook={() => changeBooking(() => bookVendor(plan, vendor.id), `${vendor.name} booked`)}
              onCancel={() => changeBooking(() => cancelBooking(plan, vendor.id), `${vendor.name} booking cancelled`)}
              onRemove={() => onUpdate({ plan: removeVendor(plan, vendor.id), effects: [] }, `${vendor.name} removed`)}
            />
          ))}
        </ul>
      )}
      <AddVendor key={`add-${category}`} category={category} onAdd={(v) => onChange(upsertVendor(plan, v))} />

      <QuoteComparison
        key={`compare-${category}`}
        plan={plan}
        category={category}
        budgetForCategory={line?.amount ?? 0}
        onSave={(v) => onChange(upsertVendor(plan, v))}
      />
    </Section>
  );
}

function VendorBrief({
  plan,
  category,
  budgetForCategory,
}: {
  plan: Plan;
  category: CategoryId;
  budgetForCategory: number;
}) {
  const call = useAiCall<VendorBriefResult>("/api/vendor-brief");
  const result = call.envelope?.data;

  return (
    <div className="subsection">
      <button
        type="button"
        className="button secondary"
        disabled={call.loading}
        onClick={() => call.run({ category, brief: plan.brief, budgetForCategory })}
      >
        {call.loading ? "Preparing…" : `What should I ask ${categoryLabel(category).toLowerCase()} vendors?`}
      </button>
      <div aria-live="polite">
        {call.error && <ErrorMessage>{call.error}</ErrorMessage>}
        {call.envelope && result && (
          <div className="proposal">
            <Provenance envelope={call.envelope} />
            <div className="grid three">
              <div>
                <h4>What you need</h4>
                <ul>
                  {result.requirements.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4>Questions to ask</h4>
                <ul>
                  {result.questions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4>Watch out for</h4>
                <ul>
                  {result.watchOuts.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function VendorRow({
  vendor,
  onSave,
  onBook,
  onCancel,
  onRemove,
}: {
  vendor: Vendor;
  onSave: (v: Vendor) => void;
  onBook: () => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const [quote, setQuote] = useState(vendor.quote === null ? "" : String(vendor.quote));
  const quoteId = `quote-${vendor.id}`;

  function saveQuote(event: SubmitEvent) {
    event.preventDefault();
    const amount = Math.round(Number(quote));
    if (quote.trim() && Number.isSafeInteger(amount) && amount >= 0)
      onSave({ ...vendor, quote: amount, status: "quoted" });
  }

  return (
    <li className="vendor">
      <div>
        <strong>{vendor.name}</strong>
        <span className={`badge ${vendor.status === "booked" ? "ok" : "muted"}`}>
          {vendor.status === "booked" ? "Booked" : vendor.status === "quoted" ? "Quoted" : "Considering"}
        </span>
        {vendor.contact && <p className="hint">{vendor.contact}</p>}
        {vendor.notes && <p className="hint">{vendor.notes}</p>}
      </div>
      {vendor.status !== "booked" ? (
        <div className="vendor-actions">
          <form onSubmit={saveQuote} className="inline-form">
            <label htmlFor={quoteId}>Their quote (₹)</label>
            <input
              id={quoteId}
              type="number"
              inputMode="numeric"
              min={0}
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
            />
            <button type="submit" className="button ghost small">
              Save quote
            </button>
          </form>
          <button type="button" className="button primary small" onClick={onBook} disabled={vendor.quote === null}>
            Mark as booked
          </button>
          <button type="button" className="button ghost small" onClick={onRemove}>
            Remove <span className="visually-hidden">{vendor.name}</span>
          </button>
        </div>
      ) : (
        <div className="vendor-actions">
          {/* Never show ₹0 as a confirmed price for a booking with no recorded quote. */}
          {vendor.quote !== null && <p>{formatInr(vendor.quote)} confirmed</p>}
          <button type="button" className="button ghost small" onClick={onCancel}>
            Cancel booking <span className="visually-hidden">with {vendor.name}</span>
          </button>
        </div>
      )}
    </li>
  );
}

function AddVendor({ category, onAdd }: { category: CategoryId; onAdd: (v: Vendor) => void }) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [quote, setQuote] = useState("");
  const [notes, setNotes] = useState("");

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const amount = quote.trim() ? Math.round(Number(quote)) : null;
    const validQuote = amount !== null && Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
    onAdd({
      id: newId(),
      category,
      name: name.trim().slice(0, 80),
      contact: contact.trim().slice(0, 120),
      quote: validQuote,
      status: validQuote !== null ? "quoted" : "considering",
      notes: notes.trim().slice(0, 500),
    });
    setName("");
    setContact("");
    setQuote("");
    setNotes("");
  }

  return (
    <details className="subsection">
      <summary>Add a {categoryLabel(category).toLowerCase()} vendor</summary>
      <form onSubmit={submit} className="grid two">
        <div className="field">
          <label htmlFor="vendor-name">Business name</label>
          <input
            id="vendor-name"
            type="text"
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="vendor-contact">Contact (optional)</label>
          <input
            id="vendor-contact"
            type="text"
            maxLength={120}
            value={contact}
            onChange={(e) => setContact(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="vendor-quote">Quoted price, if you have one (₹)</label>
          <input
            id="vendor-quote"
            type="number"
            inputMode="numeric"
            min={0}
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="vendor-notes">Notes (optional)</label>
          <input
            id="vendor-notes"
            type="text"
            maxLength={500}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <div>
          <button type="submit" className="button secondary">
            Add vendor
          </button>
        </div>
      </form>
    </details>
  );
}

const EMPTY_QUOTES = [
  { label: "Quote A", text: "" },
  { label: "Quote B", text: "" },
];

function QuoteComparison({
  plan,
  category,
  budgetForCategory,
  onSave,
}: {
  plan: Plan;
  category: CategoryId;
  budgetForCategory: number;
  onSave: (v: Vendor) => void;
}) {
  const [quotes, setQuotes] = useState(EMPTY_QUOTES);
  const call = useAiCall<CompareQuotesResult>("/api/compare-quotes");
  const filled = quotes.filter((q) => q.text.trim().length >= 20);
  const guests = plan.brief.guestCount;

  const setQuote = (i: number, patch: Partial<(typeof quotes)[number]>) =>
    setQuotes((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  function submit(event: SubmitEvent) {
    event.preventDefault();
    void call.run({ category, guestCount: guests, budgetForCategory, quotes: filled });
  }

  /** Per-guest price × headcount, computed here so it's never presented as the vendor's figure. */
  const projected = (q: QuoteSummary) => q.total ?? (q.perGuest !== null ? q.perGuest * guests : null);

  return (
    <details className="subsection">
      <summary>Compare quotes you’ve received</summary>
      <p className="hint">
        Paste each quote as the vendor sent it. Figures that aren’t written in the quote are dropped and flagged.
      </p>
      <form onSubmit={submit}>
        <div className="grid two">
          {quotes.map((q, i) => (
            <div key={i} className="field">
              <label htmlFor={`quote-label-${i}`}>Name for quote {i + 1}</label>
              <input
                id={`quote-label-${i}`}
                type="text"
                maxLength={60}
                value={q.label}
                onChange={(e) => setQuote(i, { label: e.target.value })}
              />
              <label htmlFor={`quote-text-${i}`}>Quote text</label>
              <textarea
                id={`quote-text-${i}`}
                rows={5}
                maxLength={3000}
                value={q.text}
                onChange={(e) => setQuote(i, { text: e.target.value })}
              />
            </div>
          ))}
        </div>
        <div className="actions">
          {quotes.length < 4 && (
            <button
              type="button"
              className="button ghost"
              onClick={() =>
                setQuotes((qs) => [...qs, { label: `Quote ${String.fromCharCode(65 + qs.length)}`, text: "" }])
              }
            >
              Add another quote
            </button>
          )}
          <button type="submit" className="button secondary" disabled={call.loading || filled.length === 0}>
            {call.loading ? "Reading quotes…" : "Compare"}
          </button>
        </div>
      </form>

      <div aria-live="polite">
        {call.error && <ErrorMessage>{call.error} You can still add vendors and quotes by hand above.</ErrorMessage>}
        {call.envelope && (
          <div className="table-wrap">
            <Provenance envelope={call.envelope} />
            <table>
              <caption>
                Quotes compared against your {formatInr(budgetForCategory)} {categoryLabel(category).toLowerCase()}{" "}
                estimate
              </caption>
              <thead>
                <tr>
                  <th scope="col">Quote</th>
                  <th scope="col">As quoted</th>
                  <th scope="col">For {guests} guests</th>
                  <th scope="col">Included</th>
                  <th scope="col">Extra charges</th>
                  <th scope="col">Terms</th>
                  <th scope="col">Clarify before booking</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {call.envelope.data.quotes.map((q, i) => {
                  const total = projected(q);
                  return (
                    // Two quotes can share a label, so rows are keyed by position.
                    <tr key={i}>
                      <th scope="row">{q.label}</th>
                      <td>
                        {q.total !== null && <div>{formatInr(q.total)} total</div>}
                        {q.perGuest !== null && <div>{formatInr(q.perGuest)} per guest</div>}
                        {q.guestsCovered !== null && <div>covers {q.guestsCovered}</div>}
                        {q.total === null && q.perGuest === null && <span className="hint">No price stated</span>}
                      </td>
                      <td>
                        {total === null ? (
                          "—"
                        ) : (
                          <>
                            {formatInr(total)}
                            {q.total === null && <span className="hint block">calculated</span>}
                            <span className={`hint block ${total > budgetForCategory ? "warn-text" : ""}`}>
                              {total > budgetForCategory
                                ? `${formatInr(total - budgetForCategory)} over estimate`
                                : "within estimate"}
                            </span>
                          </>
                        )}
                      </td>
                      <td>
                        <ul>
                          {q.inclusions.map((x) => (
                            <li key={x}>{x}</li>
                          ))}
                        </ul>
                      </td>
                      <td>
                        <ul>
                          {q.extraCharges.map((x) => (
                            <li key={x}>{x}</li>
                          ))}
                        </ul>
                      </td>
                      <td>
                        <ul>
                          {q.terms.map((x) => (
                            <li key={x}>{x}</li>
                          ))}
                        </ul>
                      </td>
                      <td>
                        <ul>
                          {q.needsClarification.map((x) => (
                            <li key={x}>{x}</li>
                          ))}
                        </ul>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="button ghost small"
                          onClick={() =>
                            onSave({
                              id: newId(),
                              category,
                              name: q.label,
                              contact: "",
                              quote: total,
                              status: total === null ? "considering" : "quoted",
                              notes: q.needsClarification.slice(0, 2).join(" ").slice(0, 500),
                            })
                          }
                        >
                          Save to my vendors<span className="visually-hidden">: {q.label}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </details>
  );
}
