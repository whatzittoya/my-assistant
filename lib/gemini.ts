import { GoogleGenAI } from "@google/genai";

// Gemini is off unless GEMINI_ENABLED=1 (grading/replies are done outside the app for now).
export const GEMINI_ENABLED = process.env.GEMINI_ENABLED === "1";

export function geminiDisabledResponse(): Response | null {
  if (GEMINI_ENABLED) return null;
  return Response.json(
    { error: "Gemini features are disabled (set GEMINI_ENABLED=1 to enable)" },
    { status: 503 },
  );
}

let _client: GoogleGenAI | null = null;

export function gemini(): GoogleGenAI {
  if (!GEMINI_ENABLED) throw new Error("Gemini features are disabled");
  if (_client) return _client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  _client = new GoogleGenAI({ apiKey });
  return _client;
}

export const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
