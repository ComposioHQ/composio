## How do I set up custom OAuth credentials for Canva?

Use your own Canva integration when you want users to see your app's name on the consent screen and control the credentials yourself.

### Create the Canva integration

1. Sign in to the [Canva developer portal](https://www.canva.com/developers/), open [Your integrations](https://www.canva.com/developers/integrations), and click **Create an integration**.
2. Choose the integration type:
   - **Public**: anyone on Canva can use it, but Canva must review and approve it first.
   - **Private**: only your team can use it. Requires a Canva Enterprise plan.
3. Open the integration. On the **Configuration** tab, under **Credentials**, copy the **Client ID** and **Client Secret**.
4. On the **Authentication** tab, under **Authorized redirects**, add `https://backend.composio.dev/api/v1/auth-apps/add`. It must exactly match the `oauth_redirect_uri` field in your Composio auth config.
5. On the **Scopes** tab, enable the scopes your auth config will request (see below).
6. For a public integration, submit it for review.

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create Auth Config**, and select **Canva**.
2. Keep the authentication type as **OAuth2** and choose to use your own developer credentials.
3. Paste the **Client ID** and **Client Secret**, then click **Create Canva Auth Config**.
4. Click **Connect Account**, approve access in Canva, and confirm the account shows as **Active**.

See [Custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

### Scopes

The default auth config requests `asset:read`, `asset:write`, `brandtemplate:content:read`, `brandtemplate:meta:read`, `comment:read`, `comment:write`, `design:content:read`, `design:content:write`, `design:meta:read`, `folder:read`, `folder:write`, `folder:permission:write`, and `profile:read`. Edit the **Scopes** field on the auth config to request fewer, and keep it in line with the scopes enabled on the Canva integration.
