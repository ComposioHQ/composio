## How do I connect PostHog with an API key?

PostHog connects with a personal API key. There's no OAuth option.

### Create the PostHog personal API key

1. Sign in to [PostHog](https://posthog.com/). The key acts as your PostHog user, so use the account whose projects you want Composio to reach.
2. Click **Settings**, then scroll to **Personal API keys** and start a new key.
3. Give the key a descriptive label.
4. Choose its scopes. You can limit the key to specific projects or organizations and to the resources your tools need. Avoid full access unless you need it.
5. Click **Create** and copy the key right away. It starts with `phx_` and PostHog shows it only once. Don't use the `phc_` project key.

### Create the auth config in Composio

1. In the [Composio dashboard](https://dashboard.composio.dev/), go to **Auth Configs** → **Create**, select **PostHog**, and click **Create Auth Config**.
2. Click **Connect Account**. Paste the personal API key and set the region (see the next question). The default is `us`.
3. Confirm the account shows **Active** on the auth config's **Connected Accounts** tab.

See [custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

The key's PostHog scopes decide what the connection can do. To limit which Composio tools run as well, list them under **Tools Available for Execution** in the auth config's settings.

## How do I configure the PostHog region for US or EU Cloud?

Set the PostHog region on the connection. Use `us` for US Cloud or `eu` for EU Cloud. Do not pass a full URL such as `https://eu.posthog.com`; the toolkit builds the host as `<region>.posthog.com` from the region value. The field also accepts `us.i` or `eu.i` if your PostHog URL uses those hosts, and a self-hosted instance uses its own subdomain. Check your PostHog URL to confirm.

This matters because the PostHog API host is different for US and EU Cloud, and region is connection-specific rather than one fixed auth-config value for every connected account. A connection that should call `eu.posthog.com` but is left on the default `us` region can fail or return data from the wrong PostHog environment.

In the Link flow, the user sees a prefilled Region field while connecting and can choose the correct region. In the Initiate flow, set the region during connected-account creation. Existing connections were migrated to keep their current region, so they do not need to reconnect only because of this field change.
