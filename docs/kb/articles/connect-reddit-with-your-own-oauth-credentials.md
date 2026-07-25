Reddit uses OAuth 2.0. Create the [Reddit](/toolkits/reddit) auth config with your own Reddit client ID and client secret rather than relying on default credentials. This is the recommended setup for production usage because it puts your own Reddit app and credentials behind every call.

## Why your own app matters here

The Reddit toolkit depends on Reddit's APIs and on how Reddit enforces its policies. Reddit does not guarantee stable API behavior for every use case, and enforcement changes on its side can affect any app — including a shared one. Using your own credentials means changes apply to an app you control and can respond to.

Design automations against Reddit's spam and responsible-builder policies. Behavior that trips those policies will fail regardless of how the connection is configured.

## Set it up

1. Create a Reddit app in your Reddit account's app preferences.
2. Create a Composio auth config for Reddit with that client ID and secret.
3. Register the Composio redirect URL on the Reddit app.
4. Create a fresh connection through the new auth config.
