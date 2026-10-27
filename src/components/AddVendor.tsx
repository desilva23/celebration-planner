"use client";

import { useState, type SubmitEvent } from "react";
import { newId } from "@/lib/client/api";
import type { CategoryId, Vendor } from "@/lib/domain/schema";
import { categoryLabel } from "./ui";

/** A vendor the user has been in touch with, with a quote if they have one. */
export function AddVendor({ category, onAdd }: { category: CategoryId; onAdd: (v: Vendor) => void }) {
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
      payments: [],
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
