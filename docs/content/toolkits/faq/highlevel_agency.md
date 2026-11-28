## Why does a HighLevel Agency OAuth installation fail?

The `highlevel_agency` toolkit provides company-level access. For sub-account tools, use [HighLevel Location](/toolkits/highlevel_location). Both use your own Marketplace OAuth app.

1. Verify the Marketplace app's client ID and client secret. The Agency auth config also requires `app_id`, the **Marketplace OAuth App ID** from that app's details page.
2. Check the app's **Target User** and **Who can install** settings, and sign in as an administrator for the intended agency. HighLevel's [install context determines the token type](https://marketplace.gohighlevel.com/docs/Authorization/AccessTokenUseCase/index.html).
3. Request valid agency scopes for the endpoints you need using HighLevel's [scope reference](https://marketplace.gohighlevel.com/docs/Authorization/Scopes/). Set the same permissions in the Marketplace app and the Composio auth config's comma-separated `scopes` field, then authorize again.
4. Match the Marketplace redirect allowlist to the auth config's `oauth_redirect_uri` and generated authorization URL. The toolkit defaults to `https://backend.composio.dev/api/v1/auth-apps/add`. Keep your application's final return URL separate from the provider callback.

After correcting settings, create a fresh connection. If the install still fails or loops, send [support@composio.dev](mailto:support@composio.dev) the auth config ID, connected account ID, UTC timestamp, install context, and redacted redirect chain. If consent and the callback completed but the connection remains `INITIATED`, include that sequence. Don't delete the auth config as a retry step.

## How do I diagnose a HighLevel Agency `versionId` error?

Compare the generated authorization URL with the app's current Marketplace installation link. Record the app/version and the redacted URLs. `versionId` isn't an exposed field in the Agency auth-config schema, and an API version header isn't an installation version.

Public Marketplace distribution requires approval; private apps support controlled testing. Don't publish or migrate the app solely to try to clear a version error. Escalate an unresolved error with the installation-link comparison using [connection troubleshooting](/docs/oauth-mcp-troubleshooting).
