## How do I set up custom OAuth credentials for Airtable?

Use your own Airtable OAuth integration when you want users to see your app's name on the consent screen and control the credentials yourself.

### Create the Airtable OAuth integration

1. Sign in to Airtable and open the [Airtable developer hub](https://airtable.com/developers/web/api).
2. In the left menu, under **Guide**, click **OAuth integrations**, then click **+ New OAuth Integration** in the top-right corner.

   ![Airtable Builder Hub OAuth integrations page with the register button](/images/toolkits/airtable/oauth-integrations-list.webp)
3. Enter a name and description. The website field is optional. Users see these details when they authorize your app.
4. Under **Redirect URLs**, add `https://backend.composio.dev/api/v1/auth-apps/add`. It must exactly match the `oauth_redirect_uri` field in your Composio auth config, with `https` and no trailing slash.
5. Save the integration and copy the **Client ID** and **Client Secret**.

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create Auth Config**, and select **Airtable**.
2. Set the authentication type to **OAuth2** and choose **Use your own developer authentication**.

   ![Use your own developer credentials toggle turned on in the auth config form](/images/toolkits/shared/SzVC6OY8pTVVwlrOjHLuhuv0u3Y.webp)
3. Paste the **Client ID** and **Client Secret**, then click **Create Airtable Auth Config**.
4. Click **Connect Account**. On the Airtable consent screen, select the bases or workspaces to grant and click **Approve**. Confirm the account shows as **Active**.

See [Custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

### Scopes

The default auth config requests `data.records:read`, `data.records:write`, `data.recordComments:read`, `data.recordComments:write`, `schema.bases:read`, `schema.bases:write`, and `user.email:read`. Change the **Scopes** field on the auth config if your integration needs fewer.

If the connection fails, check that the redirect URL in Airtable matches the auth config's `oauth_redirect_uri` exactly.
