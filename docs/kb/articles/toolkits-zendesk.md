Use this guide to connect a Zendesk account and discover the current tools and triggers for tickets and search.

## Connect Zendesk with the correct subdomain and auth scheme

**Let OAuth inject the access token automatically.** For Zendesk OAuth, the access token is injected automatically after the OAuth flow completes; customers do not need to manually enter it. Redirect URI can be optional depending on the auth-config setup, but if Zendesk requires one, configure the Composio auth redirect URL in the Zendesk OAuth app.

**Pass the account subdomain, not the full URL.** Zendesk requires the account subdomain during connection initiation. Pass the Zendesk site prefix, not the full URL, as `subdomain`. Composio uses that field to construct Zendesk URLs.

**Include the subdomain in OAuth config values.** When initiating a Zendesk OAuth connected account, pass `subdomain` in the connection config values. For the current SDK shape, use `config={"auth_scheme":"OAUTH2","val":{"subdomain":"<site-name>"}}`; older examples used `connected_account_params={"subdomain":"<site-name>"}`.

**Pass the subdomain and encoded credential for API-key/basic auth.** For Zendesk API-key/basic auth connection initiation, pass the Zendesk `subdomain` and `basic_encoded` credential value in the connection data. The `basic_encoded` value should be the base64 encoding of the Zendesk email/token credential form requested by the auth config.

## Use current Zendesk tools and triggers

**Request the latest toolkit version when listing tools.** When listing Zendesk tools through the API, include the toolkit version query parameter. For example, use `toolkit_versions=latest&toolkit_slug=zendesk&limit=1000`. Without the toolkit version query, the API response may not show the expected tool set.

**Search Zendesk with the dedicated search action.** Use `ZENDESK_SEARCH_ZENDESK` for Zendesk search use cases.

**Update tickets with the current ticket action.** Use `ZENDESK_UPDATE_ZENDESK_TICKET` for Zendesk ticket updates. For endpoint-level context, the corresponding Zendesk API is the Update Ticket endpoint in Zendesk's ticketing API.

**Fetch known ticket details directly.** The Zendesk get-ticket-by-id action is available and returns the ticket details in a single tool call. Use it when the customer has a Zendesk ticket ID and needs the ticket's metadata/details rather than searching first.

**Verify the current trigger catalog before quoting availability.** Zendesk has trigger support in Composio. Verify the current trigger catalog before naming an exact count.
