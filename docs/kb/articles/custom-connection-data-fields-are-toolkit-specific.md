Do not assume every API-key or bearer-token toolkit accepts `custom_connection_data.val.api_key`. Each toolkit defines its own required field names. For example, this shape is incorrect for Crowdin:

```json
{
  "val": {
    "api_key": "<token>"
  }
}
```

Crowdin expects:

```json
{
  "val": {
    "bearer_token": "<token>"
  }
}
```

Inspect the toolkit metadata before constructing `custom_connection_data`:

```bash
curl --location 'https://backend.composio.dev/api/v3.1/toolkits/<toolkit_slug>' \
  --header 'x-api-key: <COMPOSIO_API_KEY>'
```

Use the exact required keys listed under:

```text
auth_config_details[].fields.connected_account_initiation.required
```

If the account still fails after the field names match, contact Composio support with a request ID or log ID and the `custom_connection_data` shape with all secret values removed.
