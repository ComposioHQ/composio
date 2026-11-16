## How do I set up custom credentials for Trello?

Composio connects Trello with OAuth 1.0a. Use your own Trello API key and secret when you want the authorization screen to show your app name. Your Trello API key is the auth config's consumer key, and the Trello secret is its consumer secret.

### Create the Trello Power-Up and API key

1. Sign in to Trello and open the [Power-Ups admin portal](https://trello.com/power-ups/admin). The old `https://trello.com/app-key` page redirects here.
2. Click **New** and fill in the form: an app name, any workspace you belong to, an email and support contact, an author, and an **Iframe connector URL**. A placeholder such as `https://example.com` works if you aren't building a Power-Up UI. Click **Create**.
3. Open the Power-Up, go to the **API Key** tab, and click **Generate a new API Key**.
4. Copy the **API Key**, then reveal and copy the **Secret**.
5. **Allowed origins** lists the origins Trello may redirect users back to after they authorize. Trello blocks redirects to any origin not on the list. If authorization fails at the redirect step, add `https://backend.composio.dev`.

### Create the auth config in Composio

1. In the [Composio dashboard](https://dashboard.composio.dev/), go to **Auth Configs** → **Create** and select **Trello**.
2. Choose your own credentials. Paste the API key into the consumer key field (`consumer_key`) and the secret into the consumer secret field (`consumer_secret`).
3. Click **Create Auth Config**, then click **Connect Account**.
4. Click **Allow** on Trello's authorization screen and check that the account shows **Active**.

See [custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

### Scopes

The default auth config requests `read`, `write`, and `account`:

- `read`: read boards, lists, and cards
- `write`: create, update, and move cards
- `account`: read basic account information

Request only what you need, for example `read` alone for read-only access.

### Keep credentials safe and revoke access

The API key on its own doesn't grant access to anyone's data. The secret and any user token do, so keep them private. Each Trello user can see and revoke the tokens they've granted at `https://trello.com/u/{username}/account` under **Applications**. Trello can't reset an API key. If yours is exposed, rotate the secret and revoke the affected tokens.
