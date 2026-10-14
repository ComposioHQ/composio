---
'@composio/core': patch
---

Accept the experimental `instant.returnPricesInSearch` option on `sessions.create()` and `session.update()`. When it is set, `session.search()` returns each Instant tool's published price at `toolkitConnectionStatuses[].instantAccount.prices`, keyed by tool slug. `session.config.instant.return_prices_in_search` reports the stored value.
