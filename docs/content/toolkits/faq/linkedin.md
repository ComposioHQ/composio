## How do I set up custom OAuth credentials for LinkedIn?

Use your own LinkedIn app for production, to avoid the shared app's rate limits and to show your own app name and logo on the consent screen.

### Create the LinkedIn app

1. Go to [LinkedIn Developers](https://developer.linkedin.com/) and click **Create app**.
2. Enter the app name, your company's LinkedIn page URL, and the logo users see when they authorize. Agree to the legal terms and click **Create app**.
3. Open the app's **Auth** tab. Under **Application credentials**, copy the **Client ID** and **Client Secret**.
4. In the same tab, under **OAuth 2.0 settings**, add the authorized redirect URL `https://backend.composio.dev/api/v1/auth-apps/add`. It must exactly match the `oauth_redirect_uri` field in your Composio auth config.

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create Auth Config**, and select **LinkedIn**.
2. Keep the authentication type as **OAuth2** and choose **Use your own developer authentication**.
3. Paste the **Client ID** and **Client Secret**, then click **Create LinkedIn Auth Config**.
4. Click **Connect Account**, approve access in LinkedIn, and confirm the account shows as **Active**.

See [Custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

### Scopes

The default auth config requests `openid`, `profile`, `email`, and `w_member_social`. Your LinkedIn app must have access to every scope you request. LinkedIn restricts some scope combinations; see the scope question below.

## Why am I getting 429 rate limit errors on LinkedIn?

The default OAuth app is shared across users and has strict rate limits. Use your own OAuth app for production to avoid shared quotas.

## Why can't I use certain LinkedIn scope combinations?

LinkedIn restricts certain scope combinations. For example, `w_member_social` and `r_organization_admin` cannot be used together. If you need conflicting scopes, create your own OAuth app with the required permissions.
