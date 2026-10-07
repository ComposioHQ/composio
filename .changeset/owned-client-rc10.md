---
'@composio/core': minor
'@composio/slim': minor
---

Update the owned API client to `@composio/client@2.0.0-rc.10`.

A session tool can now ask for user input, such as an approval, instead of running: the API answers the call with `result_type: "input_required"`. `session.execute()`, `session.proxyExecute()`, provider-wrapped session tools, and the `execute` / `proxyExecute` helpers passed to custom tools throw the new `ComposioToolInputRequiredError` in that case. The error carries the questions on `inputRequests` and the opaque `request_state` on `requestState`. Nothing was executed and the call is not retried. The SDK does not submit answers yet.

Breaking changes:

- `ToolRouterSessionConfig` (`session.config`, the result of `session.update()`) and `ToolRouterSessionConfigHistoryConfig` (`session.listConfigHistory()`) are now the client's own config types. `instant` is always present (`false` or the policy object) instead of optional.
- In those config types, `toolkits` and each `tools` entry can be a `{ require_approval }`-only object, so a check for `enabled` or `disabled` no longer covers every case. `tags` can carry `require_approval`, and the config can carry `proxy_execute`.
- The session config is returned as the API sent it. The SDK no longer validates `instant` at runtime or removes a `premium_usage` key.
