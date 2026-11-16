## How do I create my own DocuSign OAuth app?

Create your own DocuSign app (Integration Key) when you want users to see your app's name on the consent screen and control the credentials yourself. DocuSign calls the client ID an **Integration Key**.

You need a DocuSign account with the Admin role. Developer accounts are free at [developers.docusign.com](https://developers.docusign.com/) and use `account-d.docusign.com`; production uses `account.docusign.com`.

### Create the DocuSign app

1. Sign in to DocuSign and click **Admin** in the top navigation. If you don't see it, ask your account owner for the Admin role.
2. In the left sidebar, under **Integrations**, click **Apps and Keys**. (Not **App Center**, which lists third-party apps.)
3. Click **Add App and Integration Key**, enter an app name such as `composio-docusign-connector`, and click **Create App**. Users see this name on the consent screen.
4. Under **General Info**, copy the **Integration Key**. This is your client ID.
5. Under **Authentication** > **User Application**, answer **Yes** to "Is your application able to securely store a client secret?". This sets the method to **Authorization Code Grant**. You can leave **Require Proof Key for Code Exchange (PKCE)** unchecked.
6. Under **Secret Keys**, click **+ Add Secret Key** and copy the secret right away. DocuSign masks it once you leave the page. If you lose it, generate a new one and update your auth config.
7. Under **Additional Settings** > **Redirect URIs**, click **+ Add URI** and enter `https://backend.composio.dev/api/v1/auth-apps/add`. It must exactly match the `oauth_redirect_uri` field in your Composio auth config.
8. Leave the CORS settings at their defaults and click **Save**. The app shows **Environment: Development** and **Go Live Status: Ready to Submit**, which is enough for the developer environment.

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create Auth Config**, and select **DocuSign**.
2. Paste the Integration Key as the **Client ID** and the secret key as the **Client Secret**.
3. Set the authorization URL field (`full`) to match where your app is registered: `https://account-d.docusign.com` for the developer environment, or `https://account.docusign.com` (the default) for production.
4. Create the auth config, click **Connect Account**, and click **Allow Access** on the DocuSign consent screen. The screen notes that the app isn't provided by DocuSign; that's expected for your own app.
5. Confirm the account shows as **Active** under the auth config's connected accounts.

See [Custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

### Scopes

The default auth config requests `signature` and `impersonation`.

### Going to production

Keep development and production separate. When you go live, promote the DocuSign app to production and create a second auth config with your production Integration Key and `https://account.docusign.com`. If you rotate credentials or change scopes, update both DocuSign and Composio, then reconnect affected accounts.
