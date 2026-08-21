## Pagination limits are endpoint-specific

Composio does not have one global page-size limit. Resource lists, catalogs, Tool Router, logs, and billing endpoints can define different limits, while toolkit actions also inherit provider-specific rules. Check the exact endpoint schema and live behavior before quoting a maximum.

## Auth-config list pages return at most 50 items

`GET /api/v3/auth_configs` and `GET /api/v3.1/auth_configs` currently return at most 50 auth configs per page. Read `next_cursor` from each response and pass it as `cursor` until it is empty.

Some generated descriptions may advertise a larger limit; the deployed endpoint still clamps the page to 50. Treat that documentation/runtime mismatch as a product issue, not as a reason to skip cursor pagination.
