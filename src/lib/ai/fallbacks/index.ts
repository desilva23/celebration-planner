// Deterministic stand-ins used when no API key is configured or the model is
// unavailable. They are deliberately modest, and the UI labels them as
// built-in suggestions rather than AI output.

export { ideasFallback } from "./ideas";
export { interpretFallback } from "./interpret";
export { runSheetFallback } from "./run-sheet";
export { vendorBriefFallback } from "./vendor-brief";
