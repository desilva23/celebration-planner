import "server-only";
import {
  CompareQuotesResultSchema,
  GeneratedIdeasSchema,
  InterpretResultSchema,
  VendorBriefResultSchema,
  type CompareQuotesRequest,
  type CompareQuotesResult,
  type IdeasRequest,
  type IdeasResult,
  type InterpretRequest,
  type InterpretResult,
  type VendorBriefRequest,
  type VendorBriefResult,
} from "./contracts";
import { generateStructured } from "./llm";
import { verifyQuoteFigures } from "./guards";
import { totalIdeaCost } from "./idea-cost";
import {
  COMPARE_QUOTES_SYSTEM,
  compareQuotesPrompt,
  IDEAS_SYSTEM,
  ideasPrompt,
  INTERPRET_SYSTEM,
  interpretPrompt,
  vendorBriefPrompt,
  vendorBriefSystem,
} from "./prompts";

export function interpret(request: InterpretRequest): Promise<InterpretResult> {
  return generateStructured({
    name: "interpret_result",
    schema: InterpretResultSchema,
    system: INTERPRET_SYSTEM,
    prompt: interpretPrompt(request),
    model: "lite",
    temperature: 0,
  });
}

export async function suggestIdeas(request: IdeasRequest): Promise<IdeasResult> {
  const result = await generateStructured({
    name: "ideas_result",
    schema: GeneratedIdeasSchema,
    system: IDEAS_SYSTEM,
    prompt: ideasPrompt(request),
    model: "smart",
    temperature: 0.8,
    timeoutMs: 30_000,
  });
  return { ...result, ideas: result.ideas.map(totalIdeaCost) };
}

export function prepareVendorBrief(request: VendorBriefRequest): Promise<VendorBriefResult> {
  return generateStructured({
    name: "vendor_brief_result",
    schema: VendorBriefResultSchema,
    system: vendorBriefSystem(request.category),
    prompt: vendorBriefPrompt(request),
    model: "lite",
    temperature: 0.3,
  });
}

export async function compareQuotes(request: CompareQuotesRequest): Promise<CompareQuotesResult> {
  const result = await generateStructured({
    name: "compare_quotes_result",
    schema: CompareQuotesResultSchema,
    system: COMPARE_QUOTES_SYSTEM,
    prompt: compareQuotesPrompt(request),
    model: "lite",
    temperature: 0,
  });
  // Pair each summary with the quote it came from (by label, falling back to
  // position) and drop any figure that doesn't appear in that quote's text.
  return {
    quotes: request.quotes.map((quote, i) => {
      const summary = result.quotes.find((q) => q.label === quote.label) ?? result.quotes[i];
      return summary
        ? verifyQuoteFigures({ ...summary, label: quote.label }, quote.text)
        : {
            label: quote.label, total: null, perGuest: null, guestsCovered: null,
            inclusions: [], extraCharges: [], terms: [],
            needsClarification: ["This quote couldn't be read. Check the text and try again."],
          };
    }),
  };
}
