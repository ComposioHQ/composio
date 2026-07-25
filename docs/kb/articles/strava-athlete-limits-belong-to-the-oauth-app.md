Strava applies connected-athlete capacity per developer application. When OAuth shows `Athlete limit exceeded`, check whether the Composio auth config uses Composio-managed Strava credentials or a customer-owned Strava app. The capacity belongs to the underlying app, so it is not necessarily controlled by the owner of the connected account.

For dedicated production capacity, create a customer-owned Strava developer app, configure it as a custom Composio auth config, and request any capacity increase from Strava for that app. The app owner can see the current capacity in Strava's API settings. Because that capacity can change, confirm it in Strava instead of relying on a fixed number.

See the [Strava custom OAuth setup guide](https://composio.dev/auth/strava) for credential setup.
