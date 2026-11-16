## How do I set up custom OAuth credentials for Bitbucket?

Use your own Bitbucket OAuth client when you want the consent screen to show your app name and to control which permissions the token gets.

### Create the Bitbucket OAuth client

1. Sign in to [Bitbucket Cloud](https://bitbucket.org/) and open the workspace you want to use. From the settings menu, select **Workspace settings**.
2. Expand **Apps and features** and select **OAuth clients** (older screens call these **OAuth consumers**). Click **Create OAuth client**.
3. On **Details**, enter a name and description. Fill in the optional application URLs if your deployment needs them.
4. On **Authorisation**, enable **Authorisation code** and set the callback URL to `https://backend.composio.dev/api/v1/auth-apps/add`. It must exactly match the auth config's `oauth_redirect_uri` field. Bitbucket enables refresh tokens along with the authorization code grant.
5. On **Scopes**, select the permissions your integration needs and click **Save**.
6. Copy the generated **Client ID** and **Client secret**. Keep the secret out of frontend code.

### Create the auth config in Composio

1. In the [Composio dashboard](https://dashboard.composio.dev/), go to **Auth Configs** → **Create** and select **Bitbucket**.
2. Choose **OAuth 2.0** and **Your Own Credentials**, then paste the Client ID and Client secret. Leave the redirect URI as the value you registered in Bitbucket.
3. Click **Create Auth Config**, then click **Connect Account**.
4. Sign in to Bitbucket, review the app name and permissions, and approve access. Check that the account shows **Active** on the auth config's **Connected Accounts** tab.

See [custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

### Scopes

Bitbucket assigns permissions on the OAuth client, not per request. Requesting fewer scopes in the auth config doesn't reduce what the token can do, so change the client's **Scopes** when you need less access. See Atlassian's [OAuth on Bitbucket Cloud](https://support.atlassian.com/bitbucket-cloud/docs/use-oauth-on-bitbucket-cloud/) guide.

For reference, `account` covers account and profile access, `repository` covers repository reads, and `pullrequest` covers pull request reads. Write, admin, and delete operations need the matching higher permission. The default auth config requests write or admin access across account, repositories, pull requests, issues, projects, snippets, pipelines, runners, webhooks, and wiki, so select those on the client if you want every tool to work.
