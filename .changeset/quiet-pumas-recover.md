---
'@composio/core': minor
'@composio/slim': minor
---

Keep TypeScript realtime subscription errors inside the SDK logging boundary so an asynchronous Pusher subscription failure cannot escape as an uncaught exception. The full subscription error payload is now logged, the success message is logged only once Pusher confirms the subscription, and `PusherService.subscribe` / `Triggers.subscribe` accept an optional `onSubscriptionError` callback so applications can react to subscription failures programmatically.
