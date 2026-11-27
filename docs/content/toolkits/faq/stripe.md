## How do I set up custom OAuth credentials for Stripe?

Use your own Stripe Connect OAuth app when you want users to see your platform's name on the consent screen and control the credentials yourself. If you only need to connect your own Stripe account, an API key is simpler; see the next question.

### Create the Stripe OAuth app

1. In the [Stripe Dashboard](https://dashboard.stripe.com/), go to **Settings** → **Connect**.
2. Under **Integration settings**, click **+ Add Integration** and fill in the form:
   - **Name**: something recognizable, for example `Composio-Integration`.
   - **Redirect URL**: `https://backend.composio.dev/api/v1/auth-apps/add`. It must use `https`, have no trailing slash, and exactly match the `oauth_redirect_uri` field in your Composio auth config.
   - **Website**, **Privacy Policy**, and **EULA** are optional.
3. Save the integration and copy the **Client ID** (starts with `ca_`).
4. For the client secret, Stripe Connect OAuth uses your platform account's secret API key. Copy it from **Developers** → **API keys** (`sk_live_`, or `sk_test_` in test mode).

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create Auth Config**, and select **Stripe**.

   ![Composio Auth Configs page with the Create Auth Config button](/images/toolkits/shared/wIAvY0hheAM7HQEF4kG2KTYATY.webp)

   ![Composio toolkit picker with Stripe selected](/images/toolkits/stripe/select-toolkit.webp)
2. Set the authentication type to **OAuth2** and choose **Use your own developer authentication**.

   ![Stripe auth config form with OAUTH2 selected, the read_write scope, and Use your own developer credentials enabled](/images/toolkits/stripe/oauth2-own-credentials.webp)
3. Paste the **Client ID** and the secret key as the **Client Secret**, then click **Create Stripe Auth Config**.
4. Click **Connect Account**, approve access in Stripe, and confirm the account shows as **Active**.

See [Custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

### Scopes

Stripe OAuth has two scopes: `read_only` and `read_write`. The default auth config requests `read_write`. Use `read_only` if your tools only read data.

## How do I connect Stripe with an API key?

1. In the [Stripe Dashboard](https://dashboard.stripe.com/apikeys), go to **Developers** → **API keys**.
2. Under **Standard keys**, copy the **Secret key**. It starts with `sk_live_`, or `sk_test_` in test mode. Don't use the publishable `pk_` key.

   ![Stripe Developers API keys page with the publishable and secret keys redacted](/images/toolkits/stripe/api-keys.webp)
3. In Composio, go to **Auth Configs**, click **Create Auth Config**, select **Stripe**, and choose **API Key** as the authentication type. Click **Create Stripe Auth Config**.

   ![Stripe auth config form with API KEY selected](/images/toolkits/stripe/api-key-auth-method.webp)
4. Click **Connect Account**, paste the secret key, and confirm the account shows as **Active**.

Keep the secret key out of client-side code.

## Why is my Stripe trigger enabled but not receiving events?

One possible cause is that the Stripe webhook destination was deleted in Stripe while the trigger still appears enabled. In that state, the trigger can look active, but Stripe has no active destination to send matching events to.

Check the Stripe Dashboard for the webhook destination associated with the trigger. If it is missing or disabled, recreate the trigger so the Stripe webhook destination is created again, then verify new Stripe events are delivered.
