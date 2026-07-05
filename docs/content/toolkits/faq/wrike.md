## What should I pass for entityId as a string when getConnections returns 404 in v3 SDK flows?


When using v3 SDK connection APIs, pass the `entityId` as a string. If the code stores the value as `enterpriseId`, pass it through the SDK entity helper, for example `.getEntity("enterpriseId")`. Also use a current v3 SDK package; in that case the use `composio==1.0.0rc9` or `composio_openai==1.0.0rc9`.

## How should I reconnect Wrike accounts that fail to refresh?


If a Wrike connection fails to refresh, have the account owner reconnect. Generate a new auth link with the connected-account refresh API, or delete the connected account and ask the owner to reconnect it.
