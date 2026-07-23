`AIRTABLE_UPDATE_MULTIPLE_RECORDS` updates at most 10 records per call, so split larger Web API-backed updates into batches of 10 or fewer.

## Process each batch independently

1. Partition the input into groups of at most 10 records.
2. Execute each group through the [Airtable toolkit](/toolkits/airtable) while respecting Airtable's provider rate limits.
3. Check every batch response and retry or repair only the failed batch.

This limit applies to the Web API-backed Composio multi-record action, not Airtable Scripting or the CSV Sync API. Updates are not atomic across batches, so a successful earlier batch is not rolled back if a later one fails. Airtable documents [API call and batch limits](https://support.airtable.com/v1/docs/managing-api-call-limits-in-airtable).
