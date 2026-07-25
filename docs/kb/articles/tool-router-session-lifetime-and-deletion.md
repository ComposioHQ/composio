Tool Router sessions are long-lived records and do not currently have a time-based expiration. That is separate from temporary workbench files, live sandbox retention, and short response-cache lifetimes, each of which has its own clock.

Reuse an existing TypeScript session with `toolRouter.use(sessionId)`.

## Deleting a session

```ts
await session.delete();
await composio.sessions.delete(sessionId);
```

Deletion takes effect immediately, and a deleted, missing, or inaccessible session returns 404 when retrieved.

Deleting a session does not delete its users, auth configs, or connected accounts. Those outlive the session and stay available to any other session that resolves them.
