---
'@composio/core': minor
'@composio/slim': minor
---

Update the owned API client to `@composio/client@2.0.0-rc.10`.

A session tool can now ask for user input, such as an approval, instead of running: the API answers the call with `result_type: "input_required"`. `session.execute()`, `session.proxyExecute()`, provider-wrapped session tools, and the `execute` / `proxyExecute` helpers passed to custom tools throw the new `ComposioToolInputRequiredError` in that case. A local custom tool whose body makes such a call lets the error through instead of returning it as a failed result. The error carries the questions on `inputRequests` and the opaque `request_state` on `requestState`. `requestState` is continuation state, so it is a non-enumerable property: read it as `error.requestState`, and `console.error(error)`, `util.inspect(error)` and `JSON.stringify(error)` leave it out. Nothing was executed and the call is not retried. The SDK does not submit answers yet.

A tool that ran now reports `result_type` as `completed` or `failed`, and a failed execution can carry a `null` or empty `error`. `session.execute()` and the custom tool `execute` helper return it as the new optional `resultType`; read it rather than `error` to tell a failure from a success. Provider-wrapped session tools, provider tool calls bound to a session, and the merged `COMPOSIO_MULTI_EXECUTE_TOOL` result set `successful` from it, so a failure without error text is no longer reported as successful. `error` is returned as the API sent it. When the API sends no `result_type`, `successful` still follows the error text.

Breaking changes:

- `ToolRouterSessionConfig` (`session.config`, the result of `session.update()`) and `ToolRouterSessionConfigHistoryConfig` (`session.listConfigHistory()`) are now the client's own config types. `instant` is always present (`false` or the policy object) instead of optional.
- In those config types, `toolkits` and each `tools` entry can be a `{ require_approval }`-only object, so a check for `enabled` or `disabled` no longer covers every case. `tags` can carry `require_approval`, and the config can carry `proxy_execute`.
- The session config is returned as the API sent it. The SDK no longer validates `instant` at runtime or removes a `premium_usage` key.
