import { createOpenAI } from "@ai-sdk/openai";

export const openai = createOpenAI({
    baseURL: "https://oai.helicone.ai/v1",
    headers: {
      "Helicone-Auth": `Bearer ${process.env.HELICONE_API_KEY}`,
      "Helicone-Cache-Enabled": "true",
      "Cache-Control": "max-age=2592000",
    },
  });