import { createOpenAI } from "@ai-sdk/openai";

export const openai = createOpenAI({
    baseURL: "https://oai.helicone.ai/v1",
    headers: {
      "Helicone-Auth": `Bearer sk-helicone-bkesgcq-dw5u3wy-qifu3iq-4qc53mi`,
      "Helicone-Cache-Enabled": "true",
      "Cache-Control": "max-age=2592000",
    },
  });