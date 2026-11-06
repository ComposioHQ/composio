---
'@composio/python-sdk': minor
---

`wait_for_connection()` handles rate limits: the delay between polls grows from 1 to 5 seconds, and a poll rejected with a 429 waits as long as its `Retry-After` header asks (up to the timeout) and polls again instead of failing the wait. A NaN timeout now times out instead of polling forever.
