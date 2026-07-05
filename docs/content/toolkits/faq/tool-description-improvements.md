# Tool Description Improvement Candidates

This file tracks support-derived wording that should improve tool descriptions or toolkit metadata instead of becoming public FAQ content.

## Airtable: AIRTABLE_UPDATE_MULTIPLE_RECORDS

Reason to keep out of the FAQ: this is a tool-description clarity issue. The most useful place for it is the tool metadata shown beside `AIRTABLE_UPDATE_MULTIPLE_RECORDS`, not a separate troubleshooting answer.

Suggested tool description:

`AIRTABLE_UPDATE_MULTIPLE_RECORDS` updates up to 10 Airtable records per request using patch semantics. Use it when you need to selectively update fields on multiple Airtable records while leaving unspecified fields unchanged. For more than 10 records, split the input into batches of 10, execute one batch per tool call, track which batches succeeded, and retry only failed batches or failed records when possible. Use `AIRTABLE_UPDATE_MULTIPLE_RECORDS_PUT` only when full replacement behavior is intended because omitted fields may be cleared. Airtable rate limits still apply across multiple batches, so use backoff or lower concurrency on 429s or transient failures.

Verification:

- Airtable's public API limit guidance says batching handles up to 10 records per request.
- Local toolkit metadata describes `AIRTABLE_UPDATE_MULTIPLE_RECORDS` as updating up to 10 records and notes that updates are not atomic.
- Local toolkit metadata describes `AIRTABLE_UPDATE_MULTIPLE_RECORDS_PUT` as a PUT update that can clear unspecified fields.
