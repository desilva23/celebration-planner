import "server-only";
import { GoogleGenAI } from "@google/genai";
import type { Completion } from "../llm";

let client: GoogleGenAI | undefined;

function model(tier: Completion["tier"]): string {
  return tier === "smart"
    ? process.env.GEMINI_MODEL || "gemini-3.8-flash"
    : process.env.GEMINI_LITE_MODEL || "gemini-3.5-flash-lite";
}

export async function geminiComplete(request: Completion): Promise<string> {
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await client.models.generateContent({
    model: model(request.tier),
    contents: request.prompt,
    config: {
      systemInstruction: request.system,
      temperature: request.temperature,
      responseMimeType: "application/json",
      responseJsonSchema: request.jsonSchema,
      abortSignal: request.signal,
    },
  });
  return response.text ?? "";
}
