# Custom MCP lifecycle documentation flow

## Goal

Reorganize the Custom MCP guide into an API-first lifecycle that a developer can follow from registration through deletion. Keep the dashboard as a short alternative, preserve the existing endpoint contracts and SDK examples, and surface limitations at the step where they affect the reader.

## Primary reader

A developer who already operates a public remote MCP server and wants to register it with Composio, sync its tools, and use the resulting `CUSTOM_*` toolkit in a session.

## Page structure

1. **Introduction**
   - Define Custom MCP and distinguish it from in-process custom tools.
   - Keep the experimental warning.
   - Summarize the lifecycle: deploy, register, connect if required, sync, use, resync, and delete.

2. **Register a Custom MCP**
   - State the public HTTPS prerequisite.
   - Present `POST /api/v3/custom/toolkits/upsert` examples for no auth, API key, and DCR OAuth.
   - Explain that the endpoint adds the `CUSTOM_` prefix.
   - Warn that `upsert` is insert-only, returns `409 Conflict` for an existing slug, and cannot update an existing toolkit.
   - Keep the dashboard as a short alternative callout rather than a second full workflow.

3. **Complete setup for the selected authentication mode**
   - No auth: registration performs the initial tool sync automatically.
   - API key: create and activate a connected account, then sync manually.
   - DCR OAuth: complete user authorization for a connected account, then sync manually.

4. **Sync and resync tools**
   - Document `POST /api/v3/custom/toolkits/sync`.
   - Explain when `connected_account_id` is required.
   - State that Composio does not continuously watch the MCP server for tool changes.
   - Explain that each successful sync creates a toolkit version.
   - State the 500-tool cap. Reject an oversized sync without partially importing it, and retain the last successful version.

5. **Delete or replace a Custom MCP**
   - Document `DELETE /api/v3.1/custom/toolkits/{slug}`.
   - Explain that replacing settings requires delete, then register again.
   - Warn that deletion removes the toolkit and its tools, revokes its connections, and removes its auth configurations and connected accounts.

6. **Authentication types**
   - Compare no auth, API key, and DCR OAuth in a compact table.
   - Keep implementation constraints, including the required API-key template and DCR authorization-code support, near the relevant mode.

7. **Use Custom MCP in a session**
   - Show the no-auth Python and TypeScript examples.
   - Show the authenticated Python and TypeScript examples.
   - Require explicit connected-account selection for authenticated Custom MCP toolkits.

8. **Responsibilities**
   - The customer owns the remote server, its public HTTPS availability, tool implementation, auth-provider behavior, and deciding when to resync after tool changes.
   - Composio handles project-scoped toolkit registration, connected-account credential storage, tool-schema syncing and versioning, proxied execution, and exposing the toolkit to sessions.
   - Avoid contractual language. Present this as an operational responsibility boundary.

9. **Technical behavior**
   - Keep the existing explanation of toolkit slugs, registry versions, Tool Router discovery, and v3 versus v3.1 version selection.

10. **Known gaps**
    - Keep a concise summary of the SDK lifecycle gap, public HTTPS requirement, lack of continuous auto-sync, explicit authenticated account selection, v3 version behavior, insert-only registration, 500-tool limit, and API-key validation limitation.
    - Repeat important limitations here even when they also appear in the lifecycle.

## Content principles

- Follow one lifecycle instead of presenting dashboard setup, API management, and SDK usage as disconnected guides.
- Explain authentication differences at the point where the lifecycle branches.
- Put destructive or surprising behavior immediately after the operation that triggers it.
- Keep runnable cURL examples and existing response examples.
- Do not document SDK lifecycle methods that do not exist.
- Do not change endpoint paths, request fields, response fields, or current platform limits.

## Verification

- Run `bun run lint:links`.
- Run `bun run types:check`.
- Run the full docs production build with the repository-supported Node.js version.
- Confirm the local route returns `200`.
- Inspect the rendered page for the lifecycle headings, insert-only warning, manual-sync explanation, delete consequences, responsibility boundary, and 500-tool limit.
- Confirm the diff only changes the Custom MCP page and this approved design record.

## Non-goals

- Adding or changing SDK methods.
- Changing platform endpoint behavior.
- Publishing the experimental endpoints into the generated public API reference.
- Documenting the complete auth-config or connected-account API lifecycle.
- Adding a separate dashboard tutorial.
