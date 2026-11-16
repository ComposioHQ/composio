## How do I set up OAuth credentials for HighLevel Location?

HighLevel Location has no Composio-managed OAuth app, so to connect with OAuth you create your own app in the HighLevel Marketplace. The Location toolkit connects to a single sub-account (HighLevel calls these locations). For agency-wide access, use the HighLevel Agency toolkit instead.

### Create the HighLevel Marketplace app

1. Sign in to the [HighLevel Marketplace](https://marketplace.gohighlevel.com/) with a developer account, click **My apps**, then click **Create app**.
2. In the **Start from scratch** window, set:
   - **App name**: any name you'll recognize, such as `Composio Location`.
   - **App type**: **Private** for testing and small pilots, or **Public** if you plan to list the app.
   - **Who is the target user of the app?**: **Sub-Account**. The Location toolkit requires this.
   - **Who can install the app?**: **Everyone**.
   - **Listing type**: **White-label**.
3. Click **Create app**.
4. Open **Advanced Settings** > **Auth**. In **Redirect URL**, paste `https://backend.composio.dev/api/v1/auth-apps/add` and click **+ Add**. It must exactly match the `oauth_redirect_uri` field in your Composio auth config.
5. On the same page, under **Scopes**, search for and tick each scope you need, such as `locations.readonly`. A note like "8 scopes unavailable" is expected: Agency-only scopes are hidden for Sub-Account apps.
6. Open **Manage** > **Secrets**. Under **Client keys**, click **+ Add**, name the key, and click **Add**.
7. Copy the **Client ID** and **Client secret** from the new row.

A private app active in more than 5 external agencies can't be installed again until you publish it.

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create**, and select **HighLevel Location** (not HighLevel Agency or HighLevel MCP).
2. Name the config, click **Next**, and choose **OAuth 2.0**.
3. Paste the **Client id** and **Client secret**, select the same scopes you chose in HighLevel, and click **Create Auth Config**.
4. Click **Connect Account** and open the generated link. Sign in to HighLevel, tick the sub-account to connect in **Select Sub-Account**, click **Continue**, then click **Allow & install**. Confirm the account shows as **Active**.

See [Custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

### Scopes

The default auth config requests `locations.readonly`. Customers approve every scope at install time, so request only what your integration uses. If an action fails with insufficient permissions, add the missing scope in both HighLevel and the auth config, then reconnect.

### Troubleshooting

- **No sub-accounts listed when connecting**: check that the app's target user is **Sub-Account** and that the HighLevel user you signed in with can access at least one sub-account.
- **Redirect URI mismatch**: the URL in HighLevel and in the auth config must be identical.

### Revoke access

- In Composio, delete the connected account from the auth config, or disable the auth config.
- In HighLevel, uninstall the app from the sub-account's installed Marketplace apps. This revokes access immediately.
