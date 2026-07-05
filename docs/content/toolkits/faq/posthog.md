## How do I set up custom OAuth credentials for PostHog?


For a step-by-step guide on creating and configuring your own PostHog OAuth credentials with Composio, see [How to create OAuth credentials for PostHog](https://composio.dev/auth/posthog).

## How does PostHog authentication work?


PostHog is API-key based in Composio. Use the user's PostHog API key when creating the connection. For connected-account creation, pass the key in the API-key auth state, for example with `generic_api_key` or the required field name returned by toolkit metadata.

## How do I configure PostHog subdomain for EU or self-hosted instances?


For EU or self-hosted PostHog instances, configure the PostHog `subdomain` or instance value instead of assuming the default cloud host. When supported by the auth flow, set the value during auth config or connection setup.

## How do I pass PostHog auth configs into Tool Router sessions?


When using PostHog through Tool Router MCP, include the auth config in the Tool Router session so the generated MCP URL has the correct auth config details. Auth configs or connected accounts created on the platform side are not automatically available inside every Tool Router session unless they are passed/associated correctly.

## How do I create a PostHog integration/auth config before expecting it in auth_configs API results?


`/api/v3/auth_configs` lists the active auth configs/integrations already created in the project. If PostHog is missing or the response is empty, create a PostHog auth config/integration first, then connect the account to it.

## API key connections may show active without live credential validation


For API-key/token auth, Composio may mark the connection `ACTIVE` once the required fields are present. That does not guarantee the PostHog API key is valid until a provider call is made. If tool execution fails later, verify the key directly with PostHog and recreate/update the connection with valid credentials.
