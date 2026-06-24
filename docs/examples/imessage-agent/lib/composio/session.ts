import { composio } from "./client.js";
import { createImessageToolkit } from "./imessage.js";

export const composioSession = composio.create(process.env.COMPOSIO_USER_ID!, {
  workbench: { enable: false },
  experimental: { customToolkits: [createImessageToolkit()] },
});
