---
'@composio/core': minor
'@composio/slim': minor
---

Requires `@composio/client` `2.0.0-rc.18`. The SDK now hands the API client its credential as the client's `auth` option and its organization and project as `scope`, instead of placing them in default headers. The `apiKey`, `userApiKey`, `orgApiKey`, `orgId` and `projectId` options, their environment fallbacks and the credentials sent on each request are unchanged, with one exception: with `apiKey: null` and only an organization API key, every request now carries `x-org-api-key`. Before, only the organization-owner operations did, and every other request went out without a credential.

Credential and scope headers in `defaultHeaders` or `createSession({ headers })` keep working, but the SDK folds them into its own options instead of forwarding them: an `x-user-api-key` or `x-org-api-key` entry becomes the credential every request carries, an `x-api-key` entry becomes the project key, and `x-org-id` / `x-project-id` entries become `orgId` / `projectId`. `getConfig()` reports the folded values (for example `apiKey: null` and `userApiKey` for an `x-user-api-key` entry) and no longer lists those entries under `defaultHeaders`. Setting more than one of `x-api-key`, `x-user-api-key` and `x-org-api-key` now throws a `ComposioError`; the API rejected every such request.

On the client returned by `getClient()`, `apiKey`, `userApiKey` and `orgApiKey` are read-only and deprecated (read the keys from `getConfig()`, or `authMode` and `scope` from the client), and a per-call `headers` option can no longer name a credential or scope header. The API client no longer reads the environment itself: the SDK still honours `COMPOSIO_ALLOW_INSECURE_HTTP=1`, and no longer applies `COMPOSIO_CUSTOM_HEADERS`; pass `defaultHeaders` instead.

The deprecated `customConnectionData` now requires `val.access_token` for `S2S_OAUTH2`, as the API does.
