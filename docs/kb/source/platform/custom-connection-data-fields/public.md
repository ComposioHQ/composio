---
type: "reference"
title: "Custom Connection Data Field Names"
description: "Public support knowledge for Custom Connection Data Field Names."
category: "authentication"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "custom-connection-data-fields"
---
# Custom Connection Data Field Names

Use this when a customer creates a custom/API-key style connected account and tool execution fails with `No authentication provided`, 401/403 provider errors, or a provider-specific auth error even though the credential itself works directly against the upstream API.

## Field names are toolkit-specific

Do not assume every API-key or bearer-token toolkit accepts `custom_connection_data.val.api_key`. The required field name is toolkit-specific. For example, this shape is incorrect for Crowdin:

```json
{
  "val": {
    "api_key": "<token>"
  }
}
```

Crowdin expected:

```json
{
  "val": {
    "bearer_token": "<token>"
  }
}
```

To verify the required field names, inspect toolkit metadata:

```bash
curl --location 'https://backend.composio.dev/api/v3.1/toolkits/<toolkit_slug>' \
  --header 'x-api-key: <COMPOSIO_API_KEY>'
```

Look under:

```text
auth_config_details[].fields.connected_account_initiation.required
```

If the mismatch continues, share a request ID or log ID with Composio support. If no request ID is available, share how `custom_connection_data` is being constructed, with secrets removed.

Example response:

```text
Could you share the `custom_connection_data` shape you're sending, with the secret value removed?

The field name is toolkit-specific. For example, some toolkits expect `bearer_token` rather than `api_key`. We can verify the required field from the toolkit metadata and make sure the credential is landing in the right field.
```
