---
'@composio/core': patch
'@composio/mastra': patch
---

Tolerate dangling `$ref` pointers in tool schemas the Composio API ships without a matching `$defs` entry. Some toolkits (e.g. `GMAIL_FETCH_EMAILS`) emit `outputParameters` with `"$ref": "#/$defs/FetchEmailsResponse"` while never declaring a top-level `$defs` block. After the strict resolver shipped with the previous Mastra fix, this caused `composio.tools.get(...)` to throw `JsonSchemaRefResolutionError` upfront, making every Gmail / Slack / Google-Calendar tool unusable through `MastraProvider`. The SDK now degrades the unresolvable branch to a permissive object schema and surfaces a single observability warning per `(toolSlug, ref)` pair instead of crashing.

- `dereferenceJsonSchema` accepts a new optional second argument `{ onUnresolved?: 'throw' | 'sentinel'; onReplace?: (ref, reason) => void }`. Default behavior is unchanged (`'throw'`) — first-party / custom-tool schemas with a typo'd `$ref` still surface as a hard error. Pass `'sentinel'` to replace unresolved branches with the same cycle-break sentinel (`{ type: 'object', additionalProperties: true }`) that the resolver already uses for `$ref` cycles. Safety caps (`MAX_REF_CHAIN_DEPTH`, `MAX_NODE_DEPTH`) keep throwing in both modes. New `UnresolvedRefStrategy`, `UnresolvedRefReason`, and `DereferenceJsonSchemaOptions` type exports.
- `MastraProvider.wrapTool` opts both `inputParameters` and `outputParameters` into `'sentinel'` mode and emits one `logger.warn` per `(toolSlug, ref)` pair via the provider-scoped dedup `Set`. The warning names the offending tool / toolkit / pointer and links to the tracking issue.
- Resolvable `$defs` / `definitions` continue to be inlined exactly as before — no regression in the type-info preservation contract introduced by the previous Mastra fix.
