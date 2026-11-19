## How do I set up custom OAuth credentials for Confluence?

Use your own Atlassian OAuth 2.0 (3LO) app when you want the consent screen to show your app name and to control which scopes it can grant.

### Create the Atlassian app

1. Sign in to the [Atlassian developer console](https://developer.atlassian.com/console/myapps) (create a developer account if you don't have one).
2. Click **Create** → **OAuth 2.0 integration**, name the app, and click **Create**.

   ![Atlassian developer console form to create a new OAuth 2.0 (3LO) integration](/images/toolkits/confluence/create-oauth-integration.webp)

3. Open **Authorization** in the sidebar and click **Configure** next to OAuth 2.0 (3LO). Set **Callback URL** to `https://backend.composio.dev/api/v1/auth-apps/add` and click **Save changes**. It must exactly match the auth config's `oauth_redirect_uri` field.

   ![Atlassian OAuth 2.0 (3LO) Callback URL set to the Composio redirect URI](/images/toolkits/shared/kvxWqV89dZHkBHkJJGy5XQdhGko.webp)

4. Open **Permissions**. Click **Add** next to the **Confluence API**, then **Configure**, and add every classic or granular scope your auth config will request (see below). Add the **User Identity API** too if you need user profile scopes. Click **Save**.

   ![Atlassian app Permissions page listing APIs, including the Confluence API](/images/toolkits/confluence/permissions-apis.webp)

   ![Confluence API scope page with Classic scopes, Granular scopes, and Edit Scopes](/images/toolkits/confluence/api-scopes.webp)

5. Open **Distribution** and set the status to **Sharing** if users outside your own Atlassian account will connect. Atlassian asks for a vendor name, privacy policy URL, and a personal data declaration.
6. Open **Settings** and copy the **Client ID** and **Secret** under **Authentication details**.

### Create the auth config in Composio

1. In the [Composio dashboard](https://dashboard.composio.dev/~/project/auth-configs?utm_source=docs&utm_medium=content&utm_campaign=toolkits-confluence), go to **Auth Configs** → **Create** and select **Confluence**.
2. Choose **OAuth 2.0** and **Your Own Credentials**, then paste the Client ID and Secret.

3. Remove any scopes you didn't add on the app's **Permissions** tab, then click **Create Auth Config**.
4. Click **Connect Account** and enter your site's **subdomain**: the part before `.atlassian.net` in your browser's address bar. For `https://acme.atlassian.net`, enter `acme`.
5. Approve the consent screen and check that the account shows **Active**.

See [custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

### Scopes

The default auth config requests granular Confluence scopes for pages, blog posts, content, comments, whiteboards, inline tasks, tasks, content restrictions and metadata, space details, and the audit log (for example `read:page:confluence`, `write:page:confluence`, `read:comment:confluence`, `read:space-details:confluence`), plus `offline_access`. The full list is in the auth config's scope picker. See Atlassian's [Confluence scopes reference](https://developer.atlassian.com/cloud/confluence/scopes-for-oauth-2-3LO-and-forge-apps/).

Every scope the auth config requests, apart from `offline_access`, must also be added on the app's **Permissions** tab. If one is missing, the connection fails with a "Something went wrong" error. Keep `offline_access` in the auth config's scopes: Atlassian only issues a refresh token when it's requested, and without one the connection stops working when the access token expires.

![Atlassian "Something went wrong" page listing Confluence scopes that haven't been added to the app](/images/toolkits/confluence/missing-scopes-error.webp)
