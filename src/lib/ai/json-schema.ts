// Providers differ in which JSON Schema keywords they accept for structured
// output. We send a portable subset (types, enums, anyOf, required,
// additionalProperties) and turn size and format limits into plain-language
// hints. The full limits are still enforced: replies are trimmed to fit, then
// validated with Zod.

import { z } from "zod";

type Node = Record<string, unknown>;

const LIMIT_KEYS = new Set([
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
]);

/** Ignore Zod's default safe-integer bounds; they say nothing useful to a model. */
const meaningful = (n: unknown): n is number => typeof n === "number" && Math.abs(n) < 1e12;

function hintsFor(node: Node): string[] {
  const hints: string[] = [];
  if (node.format === "date") hints.push("a date as YYYY-MM-DD");
  if (typeof node.maxLength === "number") hints.push(`at most ${node.maxLength} characters`);
  if (typeof node.minItems === "number" && node.minItems > 0) hints.push(`at least ${node.minItems} items`);
  if (typeof node.maxItems === "number") hints.push(`at most ${node.maxItems} items`);
  if (meaningful(node.minimum)) hints.push(`minimum ${node.minimum}`);
  if (meaningful(node.maximum)) hints.push(`maximum ${node.maximum}`);
  return hints;
}

function portable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(portable);
  if (!value || typeof value !== "object") return value;
  const node = value as Node;
  const out: Node = {};
  for (const [key, child] of Object.entries(node)) {
    if (key === "$schema" || LIMIT_KEYS.has(key)) continue;
    // Keys under `properties` are field names, so a field called "format" stays.
    out[key] =
      key === "properties"
        ? Object.fromEntries(Object.entries(child as Node).map(([field, schema]) => [field, portable(schema)]))
        : portable(child);
  }
  const hints = hintsFor(node);
  if (hints.length) {
    out.description = [node.description, ...hints].filter(Boolean).join("; ");
  }
  return out;
}

export interface ResponseSchemas {
  /** What we send to the provider. */
  portable: Node;
  /** The complete schema, used to trim replies before validation. */
  full: Node;
}

export function responseSchemas(schema: z.ZodType): ResponseSchemas {
  const full = z.toJSONSchema(schema) as Node;
  return { portable: portable(full) as Node, full };
}

/**
 * Trims a parsed reply to the schema's size limits: long strings are
 * shortened, extra array items dropped and integers rounded. Anything else is
 * left for Zod to accept or reject.
 */
export function fitToSchema(value: unknown, node: Node): unknown {
  if (Array.isArray(node.anyOf)) {
    if (value === null) return null;
    const branch = (node.anyOf as Node[]).find((b) => b.type !== "null");
    return branch ? fitToSchema(value, branch) : value;
  }
  if (node.type === "string" && typeof value === "string" && typeof node.maxLength === "number") {
    return value.length > node.maxLength ? `${value.slice(0, node.maxLength - 1).trimEnd()}…` : value;
  }
  if (node.type === "integer" && typeof value === "number") return Math.round(value);
  if (node.type === "array" && Array.isArray(value)) {
    const kept = typeof node.maxItems === "number" ? value.slice(0, node.maxItems) : value;
    return node.items ? kept.map((item) => fitToSchema(item, node.items as Node)) : kept;
  }
  if (node.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
    const properties = (node.properties ?? {}) as Record<string, Node>;
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, properties[key] ? fitToSchema(child, properties[key]) : child]),
    );
  }
  return value;
}
