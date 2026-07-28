## How do I set up custom OAuth credentials for Stripe?

For a step-by-step guide on creating and configuring your own Stripe OAuth credentials with Composio, see [How to create OAuth credentials for Stripe](https://composio.dev/auth/stripe).

## Why is my Stripe trigger enabled but not receiving events?

One possible cause is that the Stripe webhook destination was deleted in Stripe while the trigger still appears enabled. In that state, the trigger can look active, but Stripe has no active destination to send matching events to.

Check the Stripe Dashboard for the webhook destination associated with the trigger. If it is missing or disabled, recreate the trigger so the Stripe webhook destination is created again, then verify new Stripe events are delivered.
