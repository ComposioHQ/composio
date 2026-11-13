---
'@composio/python-sdk': patch
---

Reject `async def` trigger callbacks instead of dropping their events silently

Trigger callbacks run synchronously on worker threads, so an `async def` handler passed to `subscription.handle()`, or as `on_subscription_error` to `triggers.subscribe()`, only created a coroutine that was never awaited: its body never ran, and the event was lost with nothing but a `RuntimeWarning`. Registering one now raises `ValidationError`, which also covers `functools.partial` wrappers, objects with an async `__call__`, and async generators. A regular function that returns a coroutine, such as `lambda event: handler(event)`, has its coroutine closed and an error logged.
