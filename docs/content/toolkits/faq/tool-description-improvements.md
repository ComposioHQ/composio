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

## Apollo: APOLLO_BULK_PEOPLE_ENRICHMENT

Reason to keep out of the FAQ: this is a tool-description clarity issue. The useful fix is to make the bulk enrichment tool metadata explain the `details` payload shape, matching identifiers, and per-record no-match behavior.

Suggested tool description:

`APOLLO_BULK_PEOPLE_ENRICHMENT` enriches multiple people in one request. Provide each person as a separate object in the `details` array, and include the strongest identifier available for each record: `id`, `email`, `hashed_email`, `linkedin_url`, or `first_name` and `last_name` with `organization_name` or `domain`. A successful response can still include a missing record or `null` match for an individual person when the identifiers are weak or incomplete; retry those records with stronger identifiers instead of treating the whole call as failed. If `reveal_phone_number` is true, include `webhook_url` as required by Apollo. Each call consumes Apollo credits, so avoid re-enriching the same contacts and use backoff on HTTP 429 responses.

Verification:

- Current `APOLLO_PEOPLE_ENRICHMENT` metadata already lists the strong identifier options and notes that name-only inputs frequently return no matches.
- Current `APOLLO_BULK_PEOPLE_ENRICHMENT` metadata says unmatched records can be valid no-match outcomes, but does not explain the `details` array shape or identifier guidance.
- The Apollo toolkit KB evidence says bulk enrichment records belong inside a `details` array and that HTTP success can still include a missing or `null` match.
