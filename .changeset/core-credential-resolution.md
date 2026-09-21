---
'@composio/core': patch
---

Fix project API key resolution so the SDK never sends a Composio user API key (`uak_...`, as stored by `composio login`) as the `x-api-key` project credential. When that stored key is the only candidate, the constructor now throws a redacted `ComposioAPIKeyKindError` that explains the mismatch instead of making requests that fail with 401. `apiKey: null` now disables project-key authentication entirely, including the `COMPOSIO_API_KEY` and `~/.composio/user_data.json` fallbacks, and requires an `x-user-api-key` entry in `defaultHeaders`; requests then carry only that header. Malformed or unexpectedly shaped user config files produce a diagnostic that names the file without echoing its contents, and cloned instances keep the credential they were resolved with instead of re-reading the environment.
