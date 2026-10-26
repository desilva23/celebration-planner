// An iCalendar (RFC 5545) file of the dates that matter: the event itself,
// every open task's deadline and every unpaid payment. All-day events, so
// they land on the right date in any time zone.

import { addDays } from "./dates";
import { formatInr } from "./format";
import type { Plan } from "./schema";

interface CalendarEvent {
  uid: string;
  date: string;
  summary: string;
}

/** Escapes text values: backslash, semicolon, comma and newline are special. */
function escapeText(text: string): string {
  return text.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\n");
}

/**
 * Lines may be at most 75 octets; longer ones continue on lines starting with
 * a space. Counted in UTF-8 bytes, and never splitting a character.
 */
function fold(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    // Continuation lines start with a space, which counts towards their 75.
    const limit = parts.length === 0 ? 75 : 74;
    if (size + bytes > limit) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const compactDate = (iso: string) => iso.replaceAll("-", "");

function vevent(event: CalendarEvent, stamp: string): string[] {
  return [
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${compactDate(event.date)}`,
    `DTEND;VALUE=DATE:${compactDate(addDays(event.date, 1))}`,
    `SUMMARY:${escapeText(event.summary)}`,
    "END:VEVENT",
  ];
}

export function calendarFile(plan: Plan, now: Date = new Date()): string {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  // Stable per plan, so importing the file again updates events instead of duplicating them.
  const planKey = plan.createdAt.replace(/\D/g, "");
  const id = (kind: string, key: string) => `${kind}-${key}-${planKey}@celebration-planner`;
  const events: CalendarEvent[] = [
    { uid: id("event", "day"), date: plan.brief.eventDate, summary: plan.brief.title },
    ...plan.tasks
      .filter((t) => t.status === "todo")
      .map((t) => ({ uid: id("task", t.id), date: t.dueDate, summary: `Due: ${t.title}` })),
    ...plan.vendors.flatMap((v) =>
      v.payments
        .filter((p) => !p.paid)
        .map((p) => ({
          uid: id("payment", `${v.id}-${p.id}`),
          date: p.dueDate,
          summary: `Pay ${v.name}: ${p.label}, ${formatInr(p.amount)}`,
        })),
    ),
  ];
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Celebration Planner//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeText(plan.brief.title)}`,
    ...events.flatMap((event) => vevent(event, stamp)),
    "END:VCALENDAR",
  ];
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
