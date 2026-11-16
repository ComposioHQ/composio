## How do I connect Fathom with Composio-managed auth?

Composio-managed OAuth needs no Fathom OAuth app or API key.

1. In the Composio dashboard, open **Toolkits**, search for **Fathom**, and click **Add to Project**.
2. Enter a **Config Name** and click **Next**.
3. Select **OAuth 2.0**, choose **Composio Managed** under **Credentials**, keep the `public_api` scope selected, and click **Create Auth Config**.
4. Open the auth config and click **Connect Account**. In Fathom, check that the right account is signed in (click **Change** to switch), then click **Allow Access**.
5. Under **Accounts**, confirm the connected account shows as **Active**. The auth config's **Enabled** status alone doesn't mean an account is connected.

## Can I connect Fathom with an API key instead?

Yes. Create a key in Fathom under **Settings** > **API Access**, create a Fathom auth config with the **API Key** authentication type, and paste the key when you click **Connect Account**. The same **API Access** section is where Fathom offers its own OAuth app setup; see the [Fathom developer documentation](https://developers.fathom.ai/).
