## How do I connect Fathom with Composio-managed auth?

Composio-managed OAuth needs no Fathom OAuth app or API key.

1. In the Composio dashboard, open **Toolkits**, search for **Fathom**, and click **Add to Project**.

   ![Composio Toolkits page](/images/toolkits/fathom/toolkits-page.webp)

   ![Toolkits search results for Fathom](/images/toolkits/fathom/search-fathom.webp)

   ![Fathom toolkit panel with the Add to Project button](/images/toolkits/fathom/add-to-project.webp)
2. Enter a **Config Name** and click **Next**.

   ![Fathom auth config Config Name step](/images/toolkits/fathom/config-name.webp)
3. Select **OAuth 2.0**, choose **Composio Managed** under **Credentials**, keep the `public_api` scope selected, and click **Create Auth Config**.

   ![Fathom auth config with OAuth 2.0, Composio Managed, and the public_api scope selected](/images/toolkits/fathom/composio-managed-oauth.webp)
4. Open the auth config and click **Connect Account**. In Fathom, check that the right account is signed in (click **Change** to switch), then click **Allow Access**.

   ![Fathom auth config panel with the Connect Account button](/images/toolkits/fathom/connect-account.webp)

   ![Fathom authorization screen with the Allow Access button](/images/toolkits/fathom/allow-access.webp)
5. Under **Accounts**, confirm the connected account shows as **Active**. The auth config's **Enabled** status alone doesn't mean an account is connected.

   ![Fathom auth config Accounts tab with an Active connected account](/images/toolkits/fathom/active-account.webp)

## Can I connect Fathom with an API key instead?

Yes. Create a key in Fathom under **Settings** > **API Access**, create a Fathom auth config with the **API Key** authentication type, and paste the key when you click **Connect Account**. The same **API Access** section is where Fathom offers its own OAuth app setup; see the [Fathom developer documentation](https://developers.fathom.ai/).

![Fathom Settings page with the API Access section](/images/toolkits/fathom/api-access-settings.webp)
