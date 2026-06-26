## When should I use $contains for partial text matching in ATTIO_FIND_RECORD filters?

For partial matching on text attributes in ATTIO_FIND_RECORD, structure the filter with the attribute slug mapped to a $contains condition, for example {"name": {"$contains": "John"}}. If exact-match behavior is reported, ask for the specific attribute/filter shape and use the contains-style filter as the first workaround.

## When should I use custom tools when an Attio API object is not built into Composio yet?

If an Attio endpoint is not covered by the built-in toolkit, route the user to create a custom tool and request the missing tool through the Composio request portal. Custom tools can use Composio-managed auth, so the user does not need to build the entire OAuth/token-storage layer themselves.

## What does Auth config names can carry a reference ID, but custom auth config metadata mean?

Composio does not support arbitrary custom metadata on auth configs. As a workaround, set a meaningful authConfig name when creating it, such as a company name or reference ID, and use that name for identification.

## How should I handle missing Attio scopes on Composio managed auth require confirming the auth app and updating the managed OAuth app?

First confirm whether the user is using Composio's managed OAuth app or their own Attio OAuth app. If they are using Composio managed auth and required Attio scopes are missing, the integrations team needs to add those scopes to Composio's default Attio OAuth app before the user can use them through managed auth.

## How should I handle attio meeting and call recording get-by-id endpoints were a feature request?

Treat missing Attio get-by-id tools for meetings and call recordings as a toolkit feature gap. The requested endpoints were GET /v2/meetings/{id}, GET /v2/call_recordings/{id}, and GET /v2/call_recordings/{id}/transcript; add them to the tooling backlog or direct the user to request the tools.

## How should I handle top-level $ parameter names were fixed for LLM provider compatibility in the latest schema version?

For schema failures caused by top-level $-prefixed parameter names, The user should update to the latest tool schema/toolkit version. The root cause was corrected for top-level $ prefixes, and compatibility was verified across OpenAI, Claude, Gemini, and Vercel AI SDK. Nested $ prefixes were accepted by the major providers tested, while broader parameter naming conventions may still need case-specific review.

## How should I handle attio OAuth tokens cannot be programmatically revoked by Composio?

Attio is in the group of providers where Composio cannot programmatically revoke OAuth tokens because the provider does not offer a revocation API for that flow. For Attio, instruct end users to remove the connection manually in the provider's app settings, then re-authorize as needed.
