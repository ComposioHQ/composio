For a Stripe API-key connection, provide a Stripe **secret key** from **Developers → API keys → Standard keys**. A publishable key is not sufficient for server-side Stripe operations.

## Connect safely

1. In the Stripe Dashboard, open **Developers**, then **API keys** and **Standard keys**.
2. Copy the secret key for the intended account and supply it in the API-key field required by the Composio auth config.
3. Create a new connection for that account and verify a read-only action before enabling write operations.

Use `sk_test_` keys only with Stripe sandbox data and `sk_live_` keys only with live Stripe data. See [Composio authentication](/docs/authentication) and Stripe's [API keys guide](https://docs.stripe.com/keys) for current key handling.
