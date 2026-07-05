## How do I set up custom OAuth credentials for Airtable?

For a step-by-step guide on creating and configuring your own Airtable OAuth credentials with Composio, see [How to create OAuth credentials for Airtable](https://composio.dev/auth/airtable).

## AIRTABLE_UPDATE_MULTIPLE_RECORDS updates at most 10 records per call

`AIRTABLE_UPDATE_MULTIPLE_RECORDS` can update up to 10 Airtable records in one tool call. This follows Airtable's batched record update limit, so a request with more than 10 record objects should be split before execution.

For larger updates, chunk your input into groups of at most 10 records and call `AIRTABLE_UPDATE_MULTIPLE_RECORDS` once per group. Each record in the batch should identify the Airtable record to update and include the fields you want to change. Treat retries at the batch level: if one batch fails, inspect that batch's response and retry only the affected records when possible instead of replaying every successful batch.

Use `AIRTABLE_UPDATE_MULTIPLE_RECORDS` when you want patch-style updates where unspecified fields remain unchanged. If you need full replacement semantics, use the PUT variant carefully because unspecified fields may be cleared. Airtable rate limits still apply across batches, so add backoff or reduce concurrency if you see 429s or timeout-like failures.
