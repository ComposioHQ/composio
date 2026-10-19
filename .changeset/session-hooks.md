---
'@composio/core': minor
'@composio/slim': minor
---

Add session hooks. A hook can block a tool call before it runs, or block its result before the agent sees it.

`create()` and `update()` accept `hooks`. On `update()`, `hooks` replaces the whole list and `null` removes every hook. `hooks` cannot be combined with `experimental.sessionConfigId`.

```ts
const session = await composio.create('user_123', {
  hooks: [
    {
      type: 'before_execute',
      id: 'no_external_email',
      name: 'No external email',
      appliesTo: { toolkits: ['gmail'] },
      handler: {
        type: 'prompt',
        prompt: 'Sending email to anyone outside example.org',
        onMatch: 'block',
      },
    },
  ],
});
```

A blocked call comes back from `session.execute()` and `session.executeMeta()` with `resultType: 'blocked'`, empty `data`, the hook's message in `error`, and `blockReason`. Provider integrations hand it to the agent as a failed call with that message. Every result also carries `hookResults` when a hook applied.

`session.proxyExecute()` and `ctx.proxyExecute()` now return `resultType: 'completed'` or `resultType: 'blocked'`. A blocked request has no HTTP response, so TypeScript code that reads `status` has to check `resultType` first.
