## How do I set up custom OAuth credentials for Jira?

Use your own Atlassian OAuth 2.0 (3LO) app when you want the consent screen to show your app name and to control which scopes it can grant.

### Create the Atlassian app

1. Sign in to the [Atlassian developer console](https://developer.atlassian.com/console/myapps) (create a developer account if you don't have one).
2. Click **Create** → **OAuth 2.0 integration**, name the app, and click **Create**.

   ![Atlassian developer console form to create a new OAuth 2.0 (3LO) integration](/images/toolkits/jira/create-oauth-integration.webp)

3. Open **Authorization** in the sidebar and click **Configure** next to OAuth 2.0 (3LO). Set **Callback URL** to `https://backend.composio.dev/api/v1/auth-apps/add` and click **Save changes**. It must exactly match the auth config's `oauth_redirect_uri` field.

   ![Atlassian OAuth 2.0 (3LO) Callback URL set to the Composio redirect URI](/images/toolkits/shared/kvxWqV89dZHkBHkJJGy5XQdhGko.webp)

4. Open **Permissions**. Click **Add** next to the **Jira API**, then **Configure**, and add every classic or granular scope your auth config will request (see below). Add the **User Identity API** too if you need user profile scopes. Click **Save**.

   ![Atlassian app Permissions page listing APIs, including the Jira API](/images/toolkits/jira/permissions-apis.webp)

   ![Jira API scope page with Classic scopes, Granular scopes, and Edit Scopes](/images/toolkits/jira/api-scopes.webp)

5. Open **Distribution** and set the status to **Sharing** if users outside your own Atlassian account will connect. Atlassian asks for a vendor name, privacy policy URL, and a personal data declaration.
6. Open **Settings** and copy the **Client ID** and **Secret** under **Authentication details**.

### Create the auth config in Composio

1. In the [Composio dashboard](https://dashboard.composio.dev/~/project/auth-configs?utm_source=docs&utm_medium=content&utm_campaign=toolkits-jira), go to **Auth Configs** → **Create** and select **Jira**.
2. Choose **OAuth 2.0** and **Your Own Credentials**, then paste the Client ID and Secret.

3. Remove any scopes you didn't add on the app's **Permissions** tab, then click **Create Auth Config**.
4. Click **Connect Account** and enter your site's **subdomain**: the part before `.atlassian.net` in your browser's address bar. For `https://acme.atlassian.net`, enter `acme`.

5. Approve the consent screen and check that the account shows **Active**.

See [custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

### Scopes

The default auth config requests the classic scopes `read:jira-work`, `write:jira-work`, `read:jira-user`, `manage:jira-project`, `manage:jira-configuration`, `manage:jira-webhook`, and `manage:jira-data-provider`; Jira Service Management scopes (`read:servicedesk-request`, `write:servicedesk-request`, `manage:servicedesk-customer`, `read:servicemanagement-insight-objects`); Jira Software granular scopes for sprints and boards; `read:project:jira` and `read:issue-type-scheme:jira`; and `offline_access`. The service management scopes live under the **Jira Service Management API** on the **Permissions** tab, so add that API too or remove those scopes from the auth config. See Atlassian's [Jira scopes reference](https://developer.atlassian.com/cloud/jira/platform/scopes-for-oauth-2-3LO-and-forge-apps/).

Every scope the auth config requests, apart from `offline_access`, must also be added on the app's **Permissions** tab. If one is missing, the connection fails with a "Something went wrong" error. Keep `offline_access` in the auth config's scopes: Atlassian only issues a refresh token when it's requested, and without one the connection stops working when the access token expires.

![Atlassian "Something went wrong" page listing Jira scopes that haven't been added to the app](/images/toolkits/jira/missing-scopes-error.webp)

## What is the difference between JQL GET, JQL POST, and Search Issues?

JQL GET and POST target the same search functionality but use different HTTP methods. POST supports complex queries in the request body. Search Issues uses JQL POST under the hood with extra parameters and filters. For consistent results, prefer POST for complex queries. Use the `fields` parameter to request specific fields, or `["*all"]` to request all fields.
