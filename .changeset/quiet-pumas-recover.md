---
'@composio/core': patch
'@composio/slim': patch
---

Keep TypeScript realtime subscription errors inside the SDK logging boundary so an asynchronous Pusher subscription failure cannot escape as an uncaught exception. The full subscription error payload is now logged, and the success message is logged only once Pusher confirms the subscription.
