---
'@composio/core': minor
'@composio/slim': minor
---

Add experimental support for tool calls that need the user's approval.

Sessions accept a `requireApproval` list next to the `toolkits`, `tools` and `tags` filters on `create()` and `update()`. A call to a matching tool doesn't run: `session.execute()` and `session.executeMeta()` throw `ComposioToolInputRequiredError` with the questions on `inputRequests`. To answer, repeat the same call with the user's answers in `inputResponses` and the error's `requestState`:

```ts
const session = await composio.create('user_123', {
  tools: { gmail: { requireApproval: ['GMAIL_SEND_EMAIL'] } },
});

try {
  await session.execute('GMAIL_SEND_EMAIL', args);
} catch (error) {
  if (!(error instanceof ComposioToolInputRequiredError)) throw error;
  const inputResponses = await promptUser(error.inputRequests);
  await session.execute('GMAIL_SEND_EMAIL', args, {
    inputResponses,
    requestState: error.requestState,
  });
}
```

`promptUser` is a placeholder for your application's consent UI. Display each request, wait for the user's response, and return the answers keyed by request ID. Forward `decline` and `cancel` responses unchanged.

`experimental.noElicitationSupportFallback` (`'deny'` or `'allow'`) sets what happens to such a call when the session's MCP client can't ask the user.

`session.executeMeta()` now takes these answers as its third argument, so its request options move to the fourth.

The Python SDK gains the same `require_approval` lists, `experimental.no_elicitation_support_fallback`, and `input_responses` and `request_state` on `session.execute()` and `session.execute_meta()`.
