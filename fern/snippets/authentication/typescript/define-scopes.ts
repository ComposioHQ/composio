import { Composio } from "@composio/core";

const composio = new Composio();

const authConfig = await composio.authConfigs.create("HUBSPOT", {
  name: "HubspotConfig",
  type: "use_composio_managed_auth",
  credentials: {
    scopes: "sales-email-read,tickets",
  },
});

console.log(authConfig);