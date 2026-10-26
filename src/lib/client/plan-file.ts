// Plans as text: read back from storage, a file or a link, and saved as files.

import { PlanSchema, type Plan } from "../domain/schema";

/** The plan in `text`, or null if it isn't a plan this version can open. */
export function parsePlan(text: string): Plan | null {
  try {
    const parsed = PlanSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Hands `text` to the browser as a file to save. */
export function downloadFile(name: string, text: string, type = "application/json"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Some browsers read the file after click() returns, so release it later.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
