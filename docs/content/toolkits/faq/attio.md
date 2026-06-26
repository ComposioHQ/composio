## When should I use $contains for partial text matching in ATTIO_FIND_RECORD filters?

For partial matching on text attributes in ATTIO_FIND_RECORD, structure the filter with the attribute slug mapped to a $contains condition, for example {"name": {"$contains": "John"}}. If exact-match behavior is reported, ask for the specific attribute/filter shape and use the contains-style filter as the first workaround.

## When should I use custom tools when an Attio API object is not built into Composio yet?

If an Attio endpoint is not covered by the built-in toolkit, create a custom tool or request the missing tool through the Composio request portal. Custom tools can use Composio-managed auth, so the user does not need to build the entire OAuth/token-storage layer themselves.

## What does Auth config names can carry a reference ID, but custom auth config metadata mean?

Composio does not support arbitrary custom metadata on auth configs. As a workaround, set a meaningful authConfig name when creating it, such as a company name or reference ID, and use that name for identification.

## How should I handle missing Attio OAuth scopes?

First confirm whether the user is using Composio's managed OAuth app or their own Attio OAuth app. If the managed app does not include the required Attio scopes, use the user's own Attio OAuth app where those scopes are configured and approved.

## How should I handle missing Attio meeting and call-recording get-by-id tools?

If Attio get-by-id tools for meetings and call recordings are missing, submit the exact endpoints through the tool request flow. Useful examples include `GET /v2/meetings/{id}`, `GET /v2/call_recordings/{id}`, and `GET /v2/call_recordings/{id}/transcript`.

## How should I handle top-level `$` parameter names in Attio schemas?

For schema failures caused by top-level `$`-prefixed parameter names, update to the latest tool schema/toolkit version. Current schemas avoid top-level `$` prefixes that some model providers reject. Nested `$` prefixes may still be accepted depending on the provider.

## How should I handle attio OAuth tokens cannot be programmatically revoked by Composio?

Attio is in the group of providers where Composio cannot programmatically revoke OAuth tokens because the provider does not offer a revocation API for that flow. For Attio, instruct end users to remove the connection manually in the provider's app settings, then re-authorize as needed.
