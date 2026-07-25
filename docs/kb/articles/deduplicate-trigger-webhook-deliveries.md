Composio can retry an outbound trigger webhook delivery, so your endpoint may receive the same event more than once. Duplicate deliveries can include the same `log_id`, provider event or message ID, or webhook event ID. This does not necessarily mean Composio ingested the provider event twice.

Make your webhook handler idempotent and deduplicate each event on a stable identifier. Good choices include `log_id`, the provider event or message ID, or the webhook event ID. If duplicates continue beyond normal retry behavior, contact Composio support with the relevant IDs and receipt timestamps.
