// Share links carry a compressed copy of the plan in the URL fragment (after
// "#"). Browsers never send the fragment to a server, so sharing needs no
// backend and the plan isn't logged anywhere along the way.

import type { Plan } from "../domain/schema";
import { parsePlan } from "./plan-file";

const PREFIX = "#plan=";

async function transform(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const body = new Response(bytes as BodyInit).body!.pipeThrough(stream);
  return new Uint8Array(await new Response(body).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** A link to a copy of the plan. The guest list stays out: it names real people. */
export async function shareLink(plan: Plan, origin: string): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify({ ...plan, guests: [] }));
  return `${origin}/${PREFIX}${toBase64Url(await transform(json, new CompressionStream("deflate-raw")))}`;
}

/** The plan in a share link's fragment, or null when there isn't a valid one. */
export async function planFromLink(hash: string): Promise<Plan | null> {
  if (!hash.startsWith(PREFIX)) return null;
  try {
    const bytes = await transform(fromBase64Url(hash.slice(PREFIX.length)), new DecompressionStream("deflate-raw"));
    return parsePlan(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}
