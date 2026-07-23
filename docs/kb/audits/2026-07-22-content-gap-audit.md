# Public KB content-gap audit

Source commit: `5eed614`
Inventory totals: 115 public files, 670 level-two sections, and 4 body-only candidates.

## Classification counts

- Publish: 10
- Link only: 4
- Needs verification: 655
- Exclude: 5

## Publication meaning

- `publish` means selected and prepared for publication, not proof of live deployment.
- This branch is undeployed.

## Selected first batch

- Use Tool Router session files as toolkit inputs — `kb/mcp/tool-router-files/public.md#session-paths-are-not-fileuploadable-storage-keys`
- Custom connection-data fields are toolkit-specific — `kb/platform/custom-connection-data-fields/public.md#field-names-are-toolkit-specific`
- Pagination limits are endpoint-specific — `kb/platform/pagination/public.md#pagination-limits-are-endpoint-specific`
- Deduplicate trigger webhook deliveries — `kb/platform/triggers/public.md#trigger-webhook-delivery-is-at-least-once`
- Ahrefs actions must use the API host — `kb/toolkits/ahrefs/public.md#ahrefs-actions-must-call-api-ahrefs-com-not-ahrefs-com`
- Use CALENDLY_POST_INVITEE for invitee creation — `kb/toolkits/calendly/public.md#use-calendly-post-invitee-instead-of-deprecated-calendly-create-event-invitee`
- Use Canva autofill jobs for design content — `kb/toolkits/canva/public.md#use-canva-autofill-jobs-when-content-must-be-populated-into-a-design`
- Granola MCP metadata comes from the upstream server — `kb/toolkits/granola_mcp/public.md#composio-mirrors-granola-s-official-mcp-server`
- Inspect Odoo JSON-RPC errors inside HTTP 200 responses — `kb/toolkits/odoo/public.md#json-rpc-access-errors-can-arrive-inside-http-200-responses`
- Strava athlete limits belong to the OAuth app — `kb/toolkits/strava/public.md#athlete-limit-errors-belong-to-the-oauth-application`

## Risk themes

- Hold unverified product limits, provider behavior, and time-sensitive operational claims until authoritative sources confirm them.
- Exclude resolved incidents and internal-only guidance from publication candidates.

## Noncanonical archive findings

- `platform/compliance-data-handling`, Google Classroom, Google Tasks, Kommo, and Linear exist only in `public-kb` relative to current canonical public pages and require canonical proposals plus verification.
- `routing` is internal and excluded.
- `toolkits/rube` is obsolete naming and excluded; any durable consumer fact must be rewritten for Composio For You in canonical support knowledge.
- `README` and `index` are navigation, not article candidates.
