// Serves the production build the way the container does (see Dockerfile):
// the standalone server, with the static assets copied in beside it.
import { cpSync, existsSync } from "node:fs";

if (!existsSync(".next/standalone/server.js")) {
  console.error("No production build found. Run `npm run build` first.");
  process.exit(1);
}
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
await import("../.next/standalone/server.js");
