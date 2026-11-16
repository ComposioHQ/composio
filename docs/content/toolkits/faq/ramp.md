## How do I set up custom OAuth credentials for Ramp?

Ramp has no Composio-managed app, so you register your own OAuth app in Ramp and use its credentials in the auth config. You need **Owner** or **Admin** access in Ramp to see the **Developer** page.

### Create the Ramp app

1. Sign in to Ramp. Click your profile icon in the top-right corner and select **Settings**.
2. In the left sidebar, expand **Company** and click **Developer**.
3. Under **My apps**, click **Create new app**. Enter an **App name**, accept the Developer Terms of Service, and click **Create app**.
4. Ramp emails you a 6-digit verification code. Enter it and click **Verify**. The code expires after 5 minutes; click **Resend** for a new one.
5. Open the new app from **My apps**. Under **Redirect URIs**, click **+ Add new URI**, enter `https://backend.composio.dev/api/v1/auth-apps/add`, and click **Add**. It must exactly match the auth config's `oauth_redirect_uri` field, with no trailing slash.
6. Under **Grant types**, turn on **Authorization code**, **Client credentials**, and **Refresh token**. Without the refresh token grant, connections stop working when the access token expires.
7. Copy the **Client ID**. Reveal the **Client secret** with the eye icon and copy it. If you lose it, click **Rotate client secret**, then update the auth config and reconnect affected accounts.
8. Under **Scopes**, click **Configure allowed scopes**, turn on the scopes you'll request, and click **Set**.

### Create the auth config in Composio

1. In the [Composio dashboard](https://dashboard.composio.dev/), go to **Auth Configs** → **Create** and select **Ramp**.
2. Paste the Client ID and Client Secret. Set the scopes to the same set you allowed on the Ramp app.
3. Check **Base URL** and **Authorization URL**. The defaults, `https://api.ramp.com/developer/v1` and `https://app.ramp.com/v1/authorize`, are for production Ramp accounts. If you registered the app on a Ramp demo account (your browser shows `demo.ramp.com`), use the `demo-api.ramp.com` and `demo.ramp.com` hosts instead. The wrong environment makes the token exchange fail.
4. Click **Create Auth Config**, then **Connect Account**. Review the permissions on Ramp's consent screen and click **Allow**. Confirm the account shows **Active** on the auth config's **Connected Accounts** tab.

See [custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

### Scopes

The default auth config requests read and write scopes across accounting, bills, cards, departments, limits, locations, memos, purchase orders, receipts, spend programs, users, and vendors, plus read access to transactions, statements, and other resources. Every scope the auth config requests must be allowed on the Ramp app, or authorization fails. Request only what your tools need, and remove from both sides anything you don't.

If you request `accounting:write` and the Ramp account already has an accounting provider connected, Ramp's consent screen warns that granting it may conflict. Remove `accounting:write` from both the Ramp app and the auth config if you don't need it.

### Troubleshooting

- **`redirect_uri_mismatch`**: the redirect URI in Ramp doesn't exactly match the auth config's.
- **Token exchange fails**: the Base URL and Authorization URL point to the wrong Ramp environment (demo or production).
- **Connection goes inactive**: turn on the **Refresh token** grant type on the Ramp app, then reconnect from the auth config.
- **No Developer page**: ask a Ramp owner for the Owner or Admin role.
