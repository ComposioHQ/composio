## How do I set up custom OAuth credentials for PostHog?

For a step-by-step guide on creating and configuring your own PostHog OAuth credentials with Composio, see [How to create OAuth credentials for PostHog](https://composio.dev/auth/posthog).

## How do I configure the PostHog region for US or EU Cloud?

Set the PostHog region on the connection. Use `us` for US Cloud or `eu` for EU Cloud. Do not pass a full URL such as `https://eu.posthog.com`; the toolkit builds the host as `<region>.posthog.com` from the region value.

This matters because the PostHog API host is different for US and EU Cloud, and region is connection-specific rather than one fixed auth-config value for every connected account. A connection that should call `eu.posthog.com` but is left on the default `us` region can fail or return data from the wrong PostHog environment.

In the Link flow, the user sees a prefilled Region field while connecting and can choose the correct region. In the Initiate flow, set the region during connected-account creation. Existing connections were migrated to keep their current region, so they do not need to reconnect only because of this field change.
