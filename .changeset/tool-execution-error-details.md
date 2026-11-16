---
'@composio/core': minor
---

Surface the API's error details when `tools.execute` fails. `ComposioError` now declares `statusCode` and `requestId`, read from the `@composio/client` `APIError` it wraps unless passed explicitly, and `ComposioToolExecutionError` adds `apiErrorCode`, the numeric `error.code` the API sent. `code` stays the SDK's `TS-SDK::` code. Branch on `error.statusCode` (for example `410`) instead of matching message text.

**Behavior change:** a rejected execution's message now ends with the server's message, and its `possibleFixes` come from the server's `suggested_fix`.

```ts
// before
error.message; // 'Error executing the tool GITHUB_GET_REPOS'
error.possibleFixes; // ['Ensure the tool slug is correct and the input arguments for the tool is valid']

// now
error.message; // 'Error executing the tool GITHUB_GET_REPOS: <the API error message>'
error.possibleFixes; // ['<the API suggested_fix>']
```

Without a `suggested_fix`, the fix depends on the HTTP status: a 401, 402, 403, 410 or 5xx no longer suggests checking the tool slug and arguments. A response that is not the API error envelope keeps the old message. `ComposioConnectedAccountNotFoundError` (API code 1803) now keeps the client error as `cause`, and errors that wrap an `APIError` cause, such as `ComposioToolFetchError`, now carry its `statusCode` and `requestId`. `ComposioAPIServerErrorBody` is now the client's `APIErrorBody`, where `request_id` and `suggested_fix` are optional, as the API sends them.
