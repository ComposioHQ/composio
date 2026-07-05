## How do I set up custom OAuth credentials for Asana?

For a step-by-step guide on creating and configuring your own Asana OAuth credentials with Composio, see [How to create OAuth credentials for Asana](https://composio.dev/auth/asana).

## When should I use ASANA_GET_TASK_COMMENTS and pass task ID as a string for Asana task comments?

For Asana task comments, use the namespaced tool slug `ASANA_GET_TASK_COMMENTS`, not `GET_TASK_COMMENTS`. Pass the task ID as a string rather than an integer. For custom toolkit-based tools, set the Asana base URL as `https://app.asana.com/api/1.0` and include the required Authorization header.

## How should I handle deleted Asana auth configs can block MCP config edits; create a new MCP config or full-update via API?

If an Asana MCP config cannot be modified because it references deleted auth configs, create a new MCP config to unblock the user. Alternatively, use the MCP update API to full-update the existing config and remove/replace the deleted auth config references.

## What should I know about Asana trigger availability?

If Asana triggers do not fire, first verify whether the requested trigger type is currently available. If it is not available, treat it as a preview limitation or trigger request rather than a user configuration issue.

## How should I handle older SDK connection initiation may require appName, integrationId, entityId, and redirectUrl?

For older SDK flows, initiate the connection with `appName`, `integrationId`, `entityId`, and `redirectUrl`. If using custom OAuth credentials, pass `client_id` and `client_secret` under `authConfig` together with `authMode: "OAUTH2"`. Prefer current SDK/API patterns when available.
