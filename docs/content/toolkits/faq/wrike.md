## When should I use the Wrike user id, not the account id, when assigning or updating task users?

For Wrike task update or assignment fields, pass the Wrike user `id` value rather than the `accountId`. Wrike's API validates the user `id` shown in the user object, not the account ID.

## How should I handle wrike task responses expose multiple user-id fields and can resolve names?

Wrike task data can contain several user-id fields, including `authorIds`, `responsibleIds`, `sharedIds`, and `followerIds`. For fetch-task results, use the `resolve_user_names` parameter, which is enabled by default, to return those ids along with their names. If identifying the creator specifically, check `authorIds`.

## When should I use the Composio proxy endpoint or SDK executeRequest for direct Wrike API calls?

For direct Wrike API calls through an existing Composio connected account, call the Composio proxy endpoint with the Wrike path and method, for example `endpoint: "/tasks"`, `method: "GET"`, and the `connected_account_id`. In SDK code, the same pattern can be done with `toolset.client.actions.executeRequest({ connectedAccountId, endpoint: "/tasks", method: "GET", parameters: [] })`. Ensure endpoint values are quoted strings.

## What should I pass for entityId as a string when getConnections returns 404 in v3 SDK flows?

When using v3 SDK connection APIs, pass the `entityId` as a string. If the code stores the value as `enterpriseId`, pass it through the SDK entity helper, for example `.getEntity("enterpriseId")`. Also use a current v3 SDK package; in that case the use `composio==1.0.0rc9` or `composio_openai==1.0.0rc9`.

## How should I reconnect Wrike accounts that fail to refresh?

If a Wrike connection fails to refresh, have the account owner reconnect. Generate a new auth link with the connected-account refresh API, or delete the connected account and ask the owner to reconnect it.

## When should I use Wrike toolkit version 20260204_00 or latest for nested folder pagination?

For Wrike folder APIs, avoid the older `00000000_00` toolkit version when dealing with nested folders. Use version `20260204_00` or `latest` for recursive nested-folder pagination.
