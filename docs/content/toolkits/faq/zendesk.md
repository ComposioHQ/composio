## How do I set up custom OAuth credentials for Zendesk?

For a step-by-step guide on creating and configuring your own Zendesk OAuth credentials with Composio, see [How to create OAuth credentials for Zendesk](https://composio.dev/auth/zendesk).

## When should I use your own Zendesk OAuth app for production or when the default app has auth issues?

Zendesk still supports OAuth and users can connect using their own Zendesk OAuth app credentials. For production usage, or when Composio's default Zendesk OAuth app is under verification or has an auth issue, use a custom auth app / own developer app credentials to create the auth config.

## How should I handle zendesk OAuth setup does not require manually entering an access token?

For Zendesk OAuth, the access token is injected automatically after the OAuth flow completes; users do not need to manually enter it. Redirect URI can be optional depending on the auth-config setup, but if Zendesk requires one, configure the Composio auth redirect URL in the Zendesk OAuth app.

## How should I handle zendesk connections require the account subdomain?

Zendesk requires the account subdomain during connection initiation. Pass the Zendesk site prefix, not the full URL, as `subdomain`. Composio uses that field to construct Zendesk URLs.

## How should I handle initiate Zendesk OAuth connections by passing `subdomain` in config values?

When initiating a Zendesk OAuth connected account, pass `subdomain` in the connection config values. For the current SDK shape, use `config={"auth_scheme":"OAUTH2","val":{"subdomain":"<site-name>"}}`; older examples used `connected_account_params={"subdomain":"<site-name>"}`.

## How should I handle zendesk API-key/basic auth initiation passes `subdomain` and base64 encoded credentials?

For Zendesk API-key/basic auth connection initiation, pass the Zendesk `subdomain` and `basic_encoded` credential value in the connection data. The `basic_encoded` value should be the base64 encoding of the Zendesk email/token credential form requested by the auth config.

## How should I handle include `toolkit_versions` when listing Zendesk tools through the API?

When listing Zendesk tools through the API, include the toolkit version query parameter. For example, use `toolkit_versions=latest&toolkit_slug=zendesk&limit=1000`. Without the toolkit version query, the API response may not show the expected tool set.

## How should I handle `ZENDESK_SEARCH_ZENDESK` was added for Zendesk search use cases?

Use `ZENDESK_SEARCH_ZENDESK` for Zendesk search use cases. this tool was added specifically to cover the user's requested Zendesk search workflow.

## What does `ZENDESK_UPDATE_ZENDESK_TICKET` mean?

Use `ZENDESK_UPDATE_ZENDESK_TICKET` for Zendesk ticket updates. For endpoint-level context, the corresponding Zendesk API is the Update Ticket endpoint in Zendesk's ticketing API.

## How should I handle zendesk get-ticket-by-id returns ticket details in one tool call?

The Zendesk get-ticket-by-id action is available and returns the ticket details in a single tool call. Use it when the user has a Zendesk ticket ID and needs the ticket's metadata/details rather than searching first.

## Does Zendesk support triggers in Composio?

Zendesk is one of the toolkits with trigger support in Composio. Check the Zendesk toolkit page for the currently available trigger list.

## What does Zendesk mean?

Zendesk toolkit support in LangFlow is not official. A practical workaround is to create/connect the Zendesk account through the Composio dashboard first, then use that active connection in the user's flow where possible.
