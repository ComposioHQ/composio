import { Composio } from "@composio/core";
import { EveProvider } from "./eve-provider/index.js";

// Single shared Composio client. Import this everywhere instead of calling
// `new Composio(...)` per file. The EveProvider makes `session.tools()` hand
// back eve-native `defineTool`s.
export const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new EveProvider(),
});
