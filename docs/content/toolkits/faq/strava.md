## How do I set up custom OAuth credentials for Strava?

For a step-by-step guide on creating and configuring your own Strava OAuth credentials with Composio, see [How to create OAuth credentials for Strava](https://composio.dev/auth/strava).

## Why can Strava OAuth fail with "Athlete limit exceeded" or `Application.Status.Inactive`?

Strava can reject authorization or tool execution when the Strava OAuth app behind the connection has not been fully approved/activated by Strava or has hit its athlete limit.

If you are using managed Strava OAuth, you may see either "Athlete limit exceeded" during authorization or a 403 response from Strava with `Application.Status.Inactive` during tool execution.

We are working with Strava on approval and capacity for the managed Strava app. Since this depends on Strava's approval process, we do not have a concrete date to share yet.

For production use or dedicated capacity, use your own Strava OAuth app with a custom auth config, then reconnect users through that config.

## Why are private Strava activities missing?

The managed Strava OAuth scope set currently includes `read`, `activity:read`, and `profile:read_all`.

`activity:read` can read activities visible to the authenticated athlete based on Strava visibility rules, but private activities require `activity:read_all`. If private activities are missing, use your own Strava OAuth app with `activity:read_all` configured, then reconnect the account so the new scope is granted.
