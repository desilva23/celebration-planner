"use client";

import { useState, type SubmitEvent } from "react";
import type { AiEnvelope, CompareQuotesResult, QuoteSummary } from "@/lib/ai/contracts";
import { newId, useAiCall } from "@/lib/client/api";
import { formatInr } from "@/lib/domain/format";
import type { CategoryId, Plan, Vendor } from "@/lib/domain/schema";
import { categoryLabel, ErrorMessage, Provenance } from "./ui";

interface PastedQuote {
  label: string;
  text: string;
}

const EMPTY_QUOTES: PastedQuote[] = [
  { label: "Quote A", text: "" },
  { label: "Quote B", text: "" },
];

/** Pasted vendor quotes, structured side by side against the user's own estimate. */
export function QuoteComparison({
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

  function submit(event: SubmitEvent) {
    event.preventDefault();
    void call.run({ category, guestCount: guests, budgetForCategory, quotes: filled });
  }

  return (
    <details className="subsection">
      <summary>Compare quotes you’ve received</summary>
      <p className="hint">
        Paste each quote as the vendor sent it. Figures that aren’t written in the quote are dropped and flagged.
      </p>
      <QuoteInputs
        quotes={quotes}
        setQuotes={setQuotes}
        onSubmit={submit}
        loading={call.loading}
        canCompare={filled.length > 0}
      />
      <div aria-live="polite" aria-busy={call.loading}>
        {call.error && <ErrorMessage>{call.error} You can still add vendors and quotes by hand above.</ErrorMessage>}
        {call.envelope && (
          <QuoteTable
            envelope={call.envelope}
            guests={guests}
            budgetForCategory={budgetForCategory}
            category={category}
            onSave={onSave}
          />
        )}
      </div>
    </details>
  );
}

function QuoteInputs({
  quotes,
  setQuotes,
  onSubmit,
  loading,
  canCompare,
}: {
  quotes: PastedQuote[];
  setQuotes: (update: (quotes: PastedQuote[]) => PastedQuote[]) => void;
  onSubmit: (event: SubmitEvent) => void;
  loading: boolean;
  canCompare: boolean;
}) {
  const setQuote = (i: number, patch: Partial<PastedQuote>) =>
    setQuotes((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  return (
    <form onSubmit={onSubmit}>
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
        <button type="submit" className="button secondary" disabled={loading || !canCompare}>
          {loading ? "Reading quotes…" : "Compare"}
        </button>
      </div>
    </form>
  );
}

interface QuoteTableProps {
  envelope: AiEnvelope<CompareQuotesResult>;
  guests: number;
  budgetForCategory: number;
  category: CategoryId;
  onSave: (v: Vendor) => void;
}

function QuoteTable({ envelope, guests, budgetForCategory, category, onSave }: QuoteTableProps) {
  return (
    <div className="table-wrap">
      <Provenance envelope={envelope} />
      <table>
        <caption>
          Quotes compared against your {formatInr(budgetForCategory)} {categoryLabel(category).toLowerCase()} estimate
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
          {envelope.data.quotes.map((quote, i) => (
            // Two quotes can share a label, so rows are keyed by position.
            <QuoteRow
              key={i}
              quote={quote}
              total={projected(quote, guests)}
              budget={budgetForCategory}
              onSave={(total) => onSave(vendorFrom(quote, category, total))}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Per-guest price × headcount, computed here so it's never presented as the vendor's figure. */
function projected(quote: QuoteSummary, guests: number): number | null {
  return quote.total ?? (quote.perGuest !== null ? quote.perGuest * guests : null);
}

/** A vendor record from a compared quote, with what still needs clarifying as its notes. */
function vendorFrom(quote: QuoteSummary, category: CategoryId, total: number | null): Vendor {
  return {
    id: newId(),
    category,
    name: quote.label,
    contact: "",
    quote: total,
    status: total === null ? "considering" : "quoted",
    notes: quote.needsClarification.slice(0, 2).join(" ").slice(0, 500),
    payments: [],
  };
}

function QuoteRow({
  quote,
  total,
  budget,
  onSave,
}: {
  quote: QuoteSummary;
  total: number | null;
  budget: number;
  onSave: (total: number | null) => void;
}) {
  return (
    <tr>
      <th scope="row">{quote.label}</th>
      <td>
        <AsQuoted quote={quote} />
      </td>
      <td>
        <Projected total={total} calculated={quote.total === null} budget={budget} />
      </td>
      <td>
        <Bullets items={quote.inclusions} />
      </td>
      <td>
        <Bullets items={quote.extraCharges} />
      </td>
      <td>
        <Bullets items={quote.terms} />
      </td>
      <td>
        <Bullets items={quote.needsClarification} />
      </td>
      <td>
        <button type="button" className="button ghost small" onClick={() => onSave(total)}>
          Save to my vendors<span className="visually-hidden">: {quote.label}</span>
        </button>
      </td>
    </tr>
  );
}

/** Only the figures the quote itself states. */
function AsQuoted({ quote }: { quote: QuoteSummary }) {
  return (
    <>
      {quote.total !== null && <div>{formatInr(quote.total)} total</div>}
      {quote.perGuest !== null && <div>{formatInr(quote.perGuest)} per guest</div>}
      {quote.guestsCovered !== null && <div>covers {quote.guestsCovered}</div>}
      {quote.total === null && quote.perGuest === null && <span className="hint">No price stated</span>}
    </>
  );
}

function Projected({ total, calculated, budget }: { total: number | null; calculated: boolean; budget: number }) {
  if (total === null) return "—";
  const over = total > budget;
  return (
    <>
      {formatInr(total)}
      {calculated && <span className="hint block">calculated</span>}
      <span className={`hint block ${over ? "warn-text" : ""}`}>
        {over ? `${formatInr(total - budget)} over estimate` : "within estimate"}
      </span>
    </>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
