## How do I set up OAuth credentials for HighLevel Location?

HighLevel Location has no Composio-managed OAuth app, so to connect with OAuth you create your own app in the HighLevel Marketplace. The Location toolkit connects to a single sub-account (HighLevel calls these locations). For agency-wide access, use the HighLevel Agency toolkit instead.

### Create the HighLevel Marketplace app

1. Sign in to the [HighLevel Marketplace](https://marketplace.gohighlevel.com/) with a developer account, click **My apps**, then click **Create app**.

   ![HighLevel Marketplace My apps page with the Create app button](/images/toolkits/highlevel_location/my-apps-create-app.webp)
2. In the **Start from scratch** window, set:
   - **App name**: any name you'll recognize, such as `Composio Location`.
   - **App type**: **Private** for testing and small pilots, or **Public** if you plan to list the app.
   - **Who is the target user of the app?**: **Sub-Account**. The Location toolkit requires this.
   - **Who can install the app?**: **Everyone**.
   - **Listing type**: **White-label**.

   ![Start from scratch form with Private, Sub-Account, Everyone and White-label selected](/images/toolkits/highlevel_location/start-from-scratch.webp)
3. Click **Create app**.
4. Open **Advanced Settings** > **Auth**. In **Redirect URL**, paste `https://backend.composio.dev/api/v1/auth-apps/add` and click **+ Add**. It must exactly match the `oauth_redirect_uri` field in your Composio auth config.

   ![HighLevel Auth settings with the Composio redirect URL under Added redirect URLs](/images/toolkits/highlevel_location/redirect-url-added.webp)
5. On the same page, under **Scopes**, search for and tick each scope you need, such as `locations.readonly`. A note like "8 scopes unavailable" is expected: Agency-only scopes are hidden for Sub-Account apps.

   ![HighLevel Scopes section with locations.readonly selected](/images/toolkits/highlevel_location/select-scopes.webp)
6. Open **Manage** > **Secrets**. Under **Client keys**, click **+ Add**, name the key, and click **Add**.

   ![HighLevel Client keys section under Manage, Secrets](/images/toolkits/highlevel_location/client-keys.webp)

   ![HighLevel Add a client key dialog](/images/toolkits/highlevel_location/add-client-key.webp)
7. Copy the **Client ID** and **Client secret** from the new row.

A private app active in more than 5 external agencies can't be installed again until you publish it.

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create**, and select **HighLevel Location** (not HighLevel Agency or HighLevel MCP).

   ![Composio Auth Configs page with the Create button](/images/toolkits/highlevel_location/composio-auth-configs.webp)

   ![Create Auth Config search results showing HighLevel Location](/images/toolkits/highlevel_location/composio-search-highlevel.webp)
2. Name the config, click **Next**, and choose **OAuth 2.0**.

   ![HighLevel Location auth config Config Name field](/images/toolkits/highlevel_location/config-name.webp)

   ![HighLevel Location auth config with OAuth 2.0 selected and redacted Client id and Client secret](/images/toolkits/highlevel_location/oauth-credentials.webp)
3. Paste the **Client id** and **Client secret**, select the same scopes you chose in HighLevel, and click **Create Auth Config**.

   ![HighLevel Location auth config with the Composio redirect URI and locations.readonly scope](/images/toolkits/highlevel_location/redirect-uri-and-scopes.webp)
4. Click **Connect Account** and open the generated link. Sign in to HighLevel, tick the sub-account to connect in **Select Sub-Account**, click **Continue**, then click **Allow & install**. Confirm the account shows as **Active**.

   ![HighLevel Location auth config with the Connect Account button](/images/toolkits/highlevel_location/connect-account.webp)

   ![HighLevel sign-in page](/images/toolkits/highlevel_location/sign-in.webp)

   ![HighLevel Select Sub-Account window with a sub-account ticked and Continue enabled](/images/toolkits/highlevel_location/select-sub-account.webp)

   ![HighLevel Install confirmation page with the Allow & install button](/images/toolkits/highlevel_location/install-confirmation.webp)

See [Custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

### Scopes

The default auth config requests `locations.readonly`. Customers approve every scope at install time, so request only what your integration uses. If an action fails with insufficient permissions, add the missing scope in both HighLevel and the auth config, then reconnect.

### Troubleshooting

- **No sub-accounts listed when connecting**: check that the app's target user is **Sub-Account** and that the HighLevel user you signed in with can access at least one sub-account.
- **Redirect URI mismatch**: the URL in HighLevel and in the auth config must be identical.

### Revoke access

- In Composio, delete the connected account from the auth config, or disable the auth config.
- In HighLevel, uninstall the app from the sub-account's installed Marketplace apps. This revokes access immediately.

## Why does a HighLevel Location installation fail or loop?

The `highlevel_location` toolkit connects to a sub-account. For company-level access, use [HighLevel Agency](/toolkits/highlevel_agency).

1. In your [Marketplace app's Auth settings](https://marketplace.gohighlevel.com/docs/Authorization/OAuth2.0/index.html), verify the client ID, client secret, **Target User**, and **Who can install**. Use a sub-account app and sign in as an administrator who can access the intended sub-account.
2. Request valid scopes for the endpoints you need. Use HighLevel's [scope reference](https://marketplace.gohighlevel.com/docs/Authorization/Scopes/). The Composio OAuth config defaults to `locations.readonly`; its `scopes` override is comma-separated. Add missing scopes in both HighLevel and Composio, then authorize again.
3. Match `oauth_redirect_uri` to the generated authorization URL and the Marketplace allowlist. The current toolkit default is `https://backend.composio.dev/api/v1/auth-apps/add`. Your application's final return URL is a separate redirect. Record the redirect chain to locate a loop.
4. Confirm that the installing administrator selected the intended sub-account. HighLevel [issues different token types](https://marketplace.gohighlevel.com/docs/Authorization/AccessTokenUseCase/index.html) depending on the install context and app distribution settings.

Create a fresh connection after correcting settings. If matching settings still fail, contact [support@composio.dev](mailto:support@composio.dev) with the auth config ID, connection ID, UTC timestamp, install context, and redacted redirect chain. Don't delete the auth config to retry an installation.

## How do I diagnose a HighLevel `versionId` or missing app version error?

Compare the generated authorization URL with your app's current Marketplace installation link. Record the app/version and both redacted URLs for support. `versionId` isn't an exposed auth-config field in the current Location schema, so don't invent an override or substitute an API version header.

Private apps support controlled testing; public distribution requires approval. Publishing publicly isn't a universal fix for an installation failure. If the current installation link also fails, escalate to HighLevel; if Composio generates a different failing URL, send that comparison to Composio support.

## Why is my HighLevel Location connection stuck in `INITIATED`?

`INITIATED` means the connection hasn't completed. Closing the browser can leave it there. Open a fresh connection link and complete account selection, consent, and the return to Composio.

If the callback completed but the account never becomes `ACTIVE`, contact support with the connection ID, UTC timestamp, selected sub-account, and redacted redirect chain or error. Repeatedly reinstalling can hide the original failure without fixing it. Use [generic connection troubleshooting](/docs/oauth-mcp-troubleshooting) for the evidence to include.
