## How do I connect Plaid with API keys?

Plaid has no sign-in screen. You connect by pasting keys from your Plaid account into a Composio connection. Each connection uses one Plaid environment: **Sandbox** for Plaid's test data or **Production** for real bank data.

You use up to three values:

- **Client ID**: identifies your Plaid account. Always required.
- **Secret**: required. Sandbox and Production each have their own secret.
- **Access token**: points to one linked bank login, which Plaid calls an Item. Only needed for tools that read one person's bank data.

### Get your Plaid keys

1. Sign in to the [Plaid Dashboard](https://dashboard.plaid.com/). In the left menu, open **Build** → **Keys**.
2. Copy the **Client ID**. It's the same for Sandbox and Production.
3. Copy the secret for the environment you'll use. A Sandbox secret on a Production connection fails on every call, and the reverse.

   ![Plaid Dashboard Keys page with the Client ID, Sandbox secret and Production secret](/images/toolkits/plaid/keys-page.webp)

### Decide whether you need an access token

Institution tools, such as searching or listing institutions, work with only the Client ID and secret. Tools that read accounts, balances, transactions, identity, liabilities, investments, or statements also need an access token.

One connection stores one access token, so it works with one linked bank. For three linked banks, create three connections. If you're not sure, skip the token now and add it later.

To get an access token:

1. Open Plaid Link in your app. Plaid Link is Plaid's pop-up where a person picks their bank and signs in. You need a link token to open it; you can create one with the `PLAID_CREATE_LINK_TOKEN` tool on a connection that doesn't have an access token yet.
2. When the person finishes signing in, Plaid gives your app a short-lived `public_token`.
3. From your server, send it to Plaid's `POST /item/public_token/exchange` endpoint. Plaid returns the `access_token`.

Sandbox tokens start with `access-sandbox-` and Production tokens with `access-production-`.

### Create the auth config and connect

1. In the [Composio dashboard](https://dashboard.composio.dev/), go to **Auth Configs** → **Create**, select **Plaid** (API Key is the only method), and click **Create Auth Config**.

   ![Composio Create Auth Config dialog with Plaid and its API Key badge](/images/toolkits/plaid/create-auth-config.webp)

   ![Plaid auth config with API Key as the only authentication method](/images/toolkits/plaid/api-key-method.webp)

2. Open the auth config and click **Connect Account**.
3. Fill in the form:
   - **Environment**: `sandbox` (the default) or `production`.
   - **Client ID** and **Secret**: the values from the Keys page. The secret must match the environment.
   - **Item access token**: optional. Leave it empty if you only need institution tools.
   - **Legacy user token**: leave empty. It's only for Plaid integrations created before December 10, 2025 that use Plaid's old User API.

   ![Composio connect form for Plaid with Client ID, Secret and Item access token fields](/images/toolkits/plaid/connect-form.webp)

4. Click **Connect Account**. The account shows **Active** on the auth config's **Connected Accounts** tab.

**Active** only means the connection was saved. Composio can't check Plaid keys when you connect, so a wrong secret still shows Active. Run an institution search tool to test the Client ID and secret, and the get accounts tool to test the access token.

See [custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

### Create a Sandbox access token without Plaid Link

In Sandbox, two calls create a token for First Platypus Bank (`ins_109508`), Plaid's test bank. No bank sign-in is needed.

```bash
curl -X POST "https://sandbox.plaid.com/sandbox/public_token/create" \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "YOUR_CLIENT_ID",
    "secret": "YOUR_SANDBOX_SECRET",
    "institution_id": "ins_109508",
    "initial_products": ["transactions"]
  }'
```

Plaid returns a `public_token` starting with `public-sandbox-`. It expires after 30 minutes. Exchange it right away:

```bash
curl -X POST "https://sandbox.plaid.com/item/public_token/exchange" \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "YOUR_CLIENT_ID",
    "secret": "YOUR_SANDBOX_SECRET",
    "public_token": "YOUR_PUBLIC_TOKEN"
  }'
```

The response contains an `access_token` starting with `access-sandbox-`. In Production, a real person has to sign in through Plaid Link; then call the same exchange endpoint on `https://production.plaid.com` with your Production secret.

### Add or replace the access token on an existing connection

You don't need a new connection. The dashboard has no edit button for this, so [update the connected account](/reference/api-reference/connected-accounts/patchConnectedAccountsByNanoid) through the API. Copy the connected account ID (starts with `ca_`) from the **Connected Accounts** tab, and send a body that sets `connection.state.authScheme` to `API_KEY` and `connection.state.val.generic_token` to the Plaid access token. `generic_token` is the field that stores the access token, and the token must match the connection's environment. Only the token changes; the Client ID, secret, and environment stay the same. To remove the token, send `null` as its value. Run the get accounts tool to confirm it works.

### Before using Production

- Plaid must approve your account for Production and for each product you use.
- Production secrets and access tokens read real bank data. Store them only in Composio connection fields, never in prompts or tool inputs.
- Transfer and payment tools move real money in Production. Test them in Sandbox first; the toolkit includes Sandbox-only tools that simulate transfers, payments, and webhooks.

## Do I need to choose scopes for Plaid?

No. Plaid uses API keys, so there are no scopes. What a connection can do depends on the Plaid products enabled on your Plaid account and on whether the connection has an access token.

## Why does every Plaid call fail with `INVALID_API_KEYS`?

The Client ID or secret isn't valid for the connection's environment. The usual cause is a Sandbox secret on a Production connection, or the reverse. Create a new connection with the secret that matches the environment.

## Why do institution tools work but account and transaction tools fail?

The connection has no access token. Institution tools need only your keys; account, balance, and transaction tools also need the access token of a linked bank. Add one to the existing connection as described above.

## Why do I get `INVALID_ACCESS_TOKEN` from Plaid?

The access token is wrong or belongs to the other environment. A token starting with `access-sandbox-` works only on a Sandbox connection, and one starting with `access-production-` only on a Production connection.

## Why do I get `INVALID_PRODUCT` from Plaid?

Your Plaid account doesn't have access to the product the tool uses. Enable the product in the Plaid Dashboard or request access from Plaid.

## What does `ITEM_LOGIN_REQUIRED` mean?

The person's bank login changed or expired, so Plaid needs them to sign in again. Open Plaid Link in update mode for that bank. After they sign in, the same access token works again, and nothing changes in Composio.
