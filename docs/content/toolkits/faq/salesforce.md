## How do I set up custom OAuth credentials for Salesforce?

Use your own Salesforce app when you want your app name on the consent screen, your own scopes, or control over the org's app policies. New orgs use External Client Apps; older orgs can still use Connected Apps.

### Create the Salesforce app

If you don't have an org to test in, sign up for a free [Salesforce Developer Edition](https://developer.salesforce.com/signup).

**Option A: External Client App**

1. In Salesforce, click the gear icon → **Setup**. Search **App Manager** in **Quick Find** and open it.
2. Click **New External Client App**. Enter an **App Name** (the **API Name** fills in), a **Contact Email**, and keep **Distribution State** as **Local**.

   ![Salesforce External Client App Manager with the New External Client App button](/images/toolkits/salesforce/external-client-app-manager.webp)

   ![Salesforce new External Client App form with app name, API name, contact email and Distribution State](/images/toolkits/salesforce/new-external-client-app.webp)

3. Expand **OAuth Settings** and check **Enable OAuth**.
4. Set **Callback URL** to `https://backend.composio.dev/api/v1/auth-apps/add`. It must exactly match the auth config's `oauth_redirect_uri` field.
5. Add OAuth scopes. The default auth config requests `full`, `refresh_token`, and `openid`, so select **Full access (full)**, **Perform requests at any time (refresh_token, offline_access)**, and **Access unique user identifiers (openid)**.
6. Under security, keep **Require Secret for Web Server Flow** and **Require Secret for Refresh Token Flow** checked. Uncheck **Require PKCE** unless you plan to use PKCE.

   ![Salesforce Security section with Require secret for Web Server Flow and Refresh Token Flow checked and PKCE unchecked](/images/toolkits/salesforce/security-settings.webp)

7. Save. Open the app's **Settings** tab → **OAuth Settings** → **Consumer Key and Secret** and copy the **Consumer Key** (client ID) and **Consumer Secret**.

**Option B: Connected App**

1. In Setup, search **External Client App Settings** in **Quick Find** and turn on **Allow creation of Connected Apps**. Then click **New Connected App**.

   ![Salesforce External Client App Settings with Allow creation of connected apps on and the New Connected App button](/images/toolkits/salesforce/external-client-app-settings.webp)

2. Enter a **Connected App Name** and **Contact Email**.

   ![Salesforce New Connected App form with the basic information fields and Enable OAuth Settings](/images/toolkits/salesforce/new-connected-app.webp)

3. Under **API (Enable OAuth Settings)**, check **Enable OAuth Settings** and set **Callback URL** to `https://backend.composio.dev/api/v1/auth-apps/add`.
4. Add the same scopes as in Option A: `full`, `refresh_token, offline_access`, and `openid`. Add others such as `api` or `id, profile, email` if your tools need them.
5. Keep the web server flow and refresh token flow enabled with **Require Secret for Web Server Flow** checked, and save. Salesforce can take about 10 minutes to provision a new Connected App.
6. In **App Manager**, open the app's row menu → **View** → **Manage Consumer Details**, verify your identity if asked, and copy the **Consumer Key** and **Consumer Secret**.

   ![Salesforce Lightning Experience App Manager with the row menu open on View](/images/toolkits/salesforce/app-manager-view.webp)

   ![Salesforce Connected App consumer details with Consumer Key and Consumer Secret Copy buttons](/images/toolkits/salesforce/consumer-details.webp)

### Create the auth config in Composio

1. In the [Composio dashboard](https://dashboard.composio.dev/), go to **Auth Configs** → **Create** and select **Salesforce**. Salesforce Data 360 and Salesforce Service Cloud are separate toolkits.

   ![Composio dashboard sidebar with Auth Configs](/images/toolkits/salesforce/composio-auth-configs-nav.webp)

   ![Composio Create Auth Config dialog with Salesforce in the toolkit search results](/images/toolkits/salesforce/create-auth-config.webp)

2. Choose **OAuth 2.0** and **Your Own Credentials**. Paste the Consumer Key as the client ID and the Consumer Secret as the client secret. Keep the redirect URI as the value you registered in Salesforce. Click **Create Auth Config**.

   ![Salesforce auth config form with Your Own Credentials, Client ID, Client Secret and the Composio redirect URI](/images/toolkits/salesforce/own-credentials.webp)

3. Click **Connect Account** and fill in the connection fields:
   - **Subdomain**: the part of your Salesforce URL before `.salesforce.com`. Most orgs can keep the default `login`; Composio detects your instance after you sign in. If your org requires My Domain login, enter the My Domain part, such as `acme.my` for `acme.my.salesforce.com` (search **My Domain** in Setup). For a sandbox, enter `test`.
   - **Instance endpoint**: the API version path. Keep the default `/services/data/v67.0` unless your org needs another version.

4. Sign in to Salesforce, review the permissions, and click **Allow**. Confirm the account shows **Active** on the auth config's **Connected Accounts** tab.

See [custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

### IP allowlists

If the app uses **Enforce Refresh Token IP Allowlist**, or your org restricts logins with **Login IP Ranges** or **Network Access** trusted IPs, add the four [Composio outbound IP addresses](/docs/security/outbound-ips). For an External Client App, open **External Client App Manager**, choose **Edit Settings** from the app's row menu, expand **OAuth Settings**, and under **Refresh Token IP Allowlist** click **+** for each address, with the same value as the start and end IP. Add the addresses and wait 30 to 45 minutes before you turn on enforcement. Otherwise token refreshes fail with `IP restricted by the app developer` (see below).

![Salesforce External Client App Manager row menu with Edit Settings selected](/images/toolkits/salesforce/edit-settings-menu.webp)

![Salesforce Refresh Token IP Allowlist containing Composio's four IP addresses with Enforce Refresh Token IP Allowlist checked](/images/toolkits/salesforce/refresh-token-ip-allowlist.webp)

Some orgs also set **Limit Idle Refresh Token Time-to-Live (TTL)** to 30 days. In those orgs, a connection that isn't used for 30 days expires and has to be reconnected.

## `URL_NOT_RESET` usually means Salesforce subdomain was not configured and defaulted to `login`

`URL_NOT_RESET` can happen when the Salesforce org requires a specific My Domain value but the connection is using the generic `login` default or an incomplete subdomain. The default `login` value is fine for most Salesforce flows, but for org-specific failures recheck the Salesforce domain/subdomain values on the connection, pass the correct My Domain subdomain, and retry on the latest toolkit version if the issue was seen on an older pinned version.

## Why do I see `OAUTH_APPROVAL_ERROR_GENERIC` or `app must be installed into org` in Salesforce OAuth?

These errors usually mean Salesforce is blocking OAuth because the connected app has not been installed or approved for the org. The user may see `OAUTH_APPROVAL_ERROR_GENERIC`, or the callback URL may include `error=invalid_client&error_description=app+must+be+installed+into+org`.

Ask a Salesforce org admin to approve or install the connected app. In Salesforce Setup, search for **External Client App Settings** or **OAuth Connected App Usage**, find the app, and use the install/approval action shown by Salesforce. After the admin approves the app, the user should retry the OAuth connection.

![Salesforce OAuth approval error showing OAUTH_APPROVAL_ERROR_GENERIC and app must be installed into org.](/images/kb/toolkits/salesforce/salesforce-oauth-approval-error.png)

![Salesforce Setup search showing External Client App Settings for connected app approval.](/images/kb/toolkits/salesforce/salesforce-external-client-app-settings.png)

## Why do I see `invalid_grant` with `ip restricted by app developer`?

Your Salesforce connected app or external client app only accepts requests from trusted IP addresses, and Composio's request came from an address that isn't on the list. New connections fail during OAuth, and existing connections expire when their tokens refresh.

Add all four [Composio outbound IP addresses](/docs/security/outbound-ips) to the app's IP allowlist, including its refresh token IP allowlist if it has one. Add each address as its own range, with the same start and end IP. Alternatively, set the app's IP relaxation policy to relax IP restrictions.

After you update the allowlist, ask affected users to reconnect. Connections that expired don't recover on their own.

## Salesforce allows only five active refresh tokens per user per app

Salesforce allows only five active refresh tokens per user per connected app. When the same Salesforce user connects a sixth time, Salesforce can revoke the oldest refresh token, which makes older Composio connected accounts fail with token errors. If the consent screen says you've already granted access five times, clicking **Allow** revokes the oldest approval. To keep that connection, click **Deny** and revoke an approval you no longer need first. Also check whether the user changed their password, revoked the app, changed connected app refresh-token policy away from `valid until revoked`, or has org-level session policies that invalidate tokens.

## How do I query relationships like Pricebooks and Opportunities?

Use SOQL subqueries to traverse relationships. For example, Products → Pricebooks → Opportunities:

```sql
SELECT Id, Name,
  (SELECT Id, Quantity, UnitPrice, TotalPrice, PricebookEntry.Product2.Name FROM OpportunityLineItems)
FROM Opportunity
```

## What happens to deprecated Salesforce tools?

Deprecated tools continue to work until removed. Check tool descriptions for "DEPRECATED:" markers.

## Why can't I find items I created in Salesforce?

Created records may not appear in a given Salesforce view. Use search to confirm they exist.
