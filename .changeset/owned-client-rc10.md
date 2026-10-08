---
'@composio/core': minor
'@composio/slim': minor
---

Update the owned API client to `@composio/client@2.0.0-rc.11`.

A session tool can now ask for user input, such as an approval, instead of running: the API answers the call with `result_type: "input_required"`. `session.execute()`, `session.proxyExecute()`, provider-wrapped session tools, and the `execute` / `proxyExecute` helpers passed to custom tools throw the new `ComposioToolInputRequiredError` in that case. A local custom tool whose body makes such a call lets the error through instead of returning it as a failed result. The error carries the questions on `inputRequests` and the opaque `request_state` on `requestState`. `requestState` is continuation state, so it is a non-enumerable property: read it as `error.requestState`, and `console.error(error)`, `util.inspect(error)` and `JSON.stringify(error)` leave it out. Nothing was executed and the call is not retried. The SDK does not submit answers yet.

Every session tool that ran reports `result_type` as `completed` or `failed`, and a failed execution can carry a `null` or empty `error`. `session.execute()` and the custom tool `execute` helper return it as the new `resultType`, which is always present; read it rather than `error` to tell a failure from a success. Provider-wrapped session tools, provider tool calls bound to a session, and the merged `COMPOSIO_MULTI_EXECUTE_TOOL` result set `successful` from it alone, so a failure without error text is no longer reported as successful. `error` is returned as the API sent it. A session execute answer without `result_type`, or with a value this SDK does not know, throws `ValidationError` instead of being read as a success or a failure.

A `COMPOSIO_MULTI_EXECUTE_TOOL` batch that mixes local custom tools with remote tools now throws `ComposioToolInputRequiredError` when the remote half needs user input, as an all-remote batch already did. It used to report the input request as a failure message on each remote tool, without `inputRequests` or `requestState`. Local tools in that batch have already run by then, and their results are discarded by the throw.

Breaking changes:

- `ToolRouterSessionConfig` (`session.config`, the result of `session.update()`) and `ToolRouterSessionConfigHistoryConfig` (`session.listConfigHistory()`) are now the client's own config types. `instant` is always present (`false` or the policy object) instead of optional.
- In those config types, `toolkits` and each `tools` entry can be a `{ require_approval }`-only object, so a check for `enabled` or `disabled` no longer covers every case. `tags` can carry `require_approval`, and the config can carry `proxy_execute`.
- The session config is returned as the API sent it. The SDK no longer validates `instant` at runtime or removes a `premium_usage` key.
- `ToolRouterSessionExecuteResponse` requires `resultType`. A custom `ToolCallSession` passed to a provider must return it from `execute()`, because `successful` is no longer derived from `error`.
- Removed the unused `ToolRouterInstantResponseSchema` and `ToolRouterInstantResponse` exports. Use `ToolRouterSessionConfig['instant']` for the Instant policy the API returns.
