import { createOpenAI } from "@ai-sdk/openai";

export const heliconeParams = {
  baseURL: "https://oai.helicone.ai/v1",
  headers: {
    "Helicone-Auth": `Bearer ${process.env.HELICONE_API_KEY}`,
    "Helicone-Cache-Enabled": "true",
    "Helicone-User-Id": "GitHub-CI-Example-Tests",
  },
};
export const openai = createOpenAI({
  ...heliconeParams,
});
