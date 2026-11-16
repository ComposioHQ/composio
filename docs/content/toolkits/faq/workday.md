## How do I set up custom OAuth credentials for Workday?

Workday has no Composio-managed OAuth app, so you register an API client in your own Workday tenant. You need administrator or integration security permissions in Workday, and your tenant name, which appears in your Workday URLs.

### Register the Workday API client

1. Sign in to your Workday tenant, type `Register API Client` in the search bar, and press Enter.
2. Under **Tasks and Reports**, open **Register API Client**. Don't pick the Integrations variant or the external OAuth client task. If the task doesn't appear, your account lacks the required security permissions.
3. Fill in the form:
   - **Client Name**: for example, `composio-workday`.
   - **Client Grant Type**: **Authorization Code Grant**.
   - **Access Token Type**: **Bearer**.
   - **Support PKCE**: leave unchecked.
   - **Redirection URI**: `https://backend.composio.dev/api/v1/auth-apps/add`. It must exactly match the `oauth_redirect_uri` field in your Composio auth config, or the connection fails with `redirect_uri_mismatch`.
   - **Non-Expiring Refresh Tokens**: enable.
   - **Scopes**: select the areas your tools need, and check **Include Workday Owned Scope**.
4. Click **OK**, review the summary, and click **Done**.
5. On the client detail page, copy five values: **Client ID**, **Client Secret**, **REST API Endpoint**, **Token Endpoint**, and **Authorization Endpoint**. Copy them now; the secret can be masked once you leave the page, and you'd have to regenerate it.

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create Auth Config**, and select **Workday** (OAuth2).
2. Paste the **Client ID** and **Client Secret**, then create the auth config.
3. Click **Connect Account** and enter a stable user ID from your own system, such as a UUID from your user database.
4. Enter the three tenant URLs you copied, then click **Connect Account** and complete the Workday consent flow:
   - **REST API base URL**: for example, `https://wd2-impl-services1.workday.com/ccx/api/v1/<tenant>`.
   - **Authorization URL**: for example, `https://wd2-impl-services1.workday.com/ccx/oauth2/<tenant>/authorize`.
   - **Token URL**: for example, `https://wd2-impl-services1.workday.com/ccx/oauth2/<tenant>/token`.
5. Confirm the account shows as **Active** under **Connected Accounts**.

Use the exact URLs from your API client's detail page. Generic Workday URLs fail the token exchange.

See [Custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

### Set up an Integration System User and security group

Workday recommends running API clients as an Integration System User (ISU) with the right domain permissions. Most tenants already have one; check with your Workday admin first.

1. Run **Create Integration System User**. Set a username and password, set **Session Timeout Minutes** to `0`, and check **Do Not Allow UI Sessions**.
2. Run **Maintain Password Rules** and add the ISU to **System Users exempt from password expiration**.
3. Run **Create Security Group** and choose **Integration System Security Group (Unconstrained)** for access to all data instances, or **(Constrained)** for access scoped by context. Add the ISU as a member.
4. Run **Maintain Permissions for Security Group**, select the group, and on **Domain Security Policy Permissions** grant GET access to `Integration Build`, `Integration Process`, `Integration Debug`, `Integration Event`, `Worker Data: Current Staffing Information`, and `Worker Data: Public Worker Reports`.
5. Run **Activate Pending Security Policy Changes**, enter a comment, and confirm.
