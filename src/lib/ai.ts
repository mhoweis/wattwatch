import OpenAI from "openai";

export const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

let client: OpenAI | null | undefined;

export function getOpenAI(): OpenAI | null {
  if (client !== undefined) return client;
  const key = process.env.OPENAI_API_KEY;
  client = key ? new OpenAI({ apiKey: key }) : null;
  return client;
}

export function aiAvailable(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}
