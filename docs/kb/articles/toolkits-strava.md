## Athlete-limit errors belong to the OAuth application

Strava applies connected-athlete capacity per developer application. If OAuth shows `Athlete limit exceeded`, first determine whether the auth config uses Composio-managed Strava credentials or a customer-owned app; do not assume the customer owns a managed app.

For dedicated production capacity, create a customer-owned Strava developer app, configure it as a custom Composio auth config, and request any capacity increase from Strava for that app. The exact current capacity is visible to the app owner in Strava's API settings and can change, so do not quote a customer-specific number without checking it.

See the [Strava custom OAuth setup guide](https://composio.dev/auth/strava) for credential setup.
