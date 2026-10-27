import { z } from "zod";

// The Content-Security-Policy forbids eval. Unless told not to, the first
// schema Zod builds tries `new Function` to see whether it can compile faster
// parsers; the error is caught, but browsers still report a CSP violation.
// Schemas import `z` from here so this always runs before any is built.
z.config({ jitless: true });

export { z };
