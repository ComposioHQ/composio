# B2B agent companion implementation handoff

Build the companion in the examples repository after review of the [architecture page](../../content/examples/reference-architectures/b2b-agent.mdx). The architecture is a proposed design, not a tested application. This file records the implementation contract and acceptance criteria. It does not authorize deployment or sending real email.

## Product scope

Build a workplace assistant for customer organizations. Demonstrate one task: prepare a customer meeting brief from shared HubSpot data and the requesting employee's Gmail, then propose a follow-up email. Save drafts locally. Send only after the requesting employee approves the exact payload.

Support interactive requests and scheduled briefs through the same worker. Keep event-triggered runs, multiple agents, retrieval indexes, and generated-code execution outside the first implementation.

Use TypeScript, Next.js, Clerk Organizations, Postgres, Vercel AI SDK, Inngest, and Composio as the proposed stack. Verify current APIs and pin compatible dependencies in the implementation repository. Substitute a component if necessary, but preserve the responsibilities described below and update the architecture to match.

## Application records

Use opaque database identifiers. Include the tenant in foreign keys between tenant-owned records. Authenticate every endpoint and authorize every lookup, including status polling and worker entry points.

| Record | Required relationships and behavior |
|---|---|
| Tenant | Maps to an identity-provider organization and owns one stable Composio connection-owner identity |
| Membership | Links a person to a tenant, stores current role and status, and maps to a unique Composio `userId` |
| Connection | Records the tenant, toolkit, Composio account ID, status, and either the owning membership or organization identity |
| Conversation | Belongs to a tenant and requesting membership. Stores messages separately from Composio sessions |
| Run | Belongs to a conversation or schedule occurrence. Stores acting membership, selected connections, policy version, session ID, status, and usage |
| Schedule | Stores tenant, acting membership, task, explicit connections, timezone, and enabled status |
| Proposal | Stores an immutable version of the tool, account, arguments, requesting membership, policy version, and expiry |
| Approval | References the exact proposal version and stores the authenticated approver and decision |
| Action attempt | Stores the atomic claim, outcome, timestamps, and Composio execution log ID when returned |
| Pending dispatch | Commits with the run or approved action. Remains deliverable until acknowledged by the job service |

Enforce one run per schedule occurrence and one claim per approved action with database constraints. Keep tenant and membership authorization in application code as well as relational constraints. Define how the application refreshes membership from the identity provider and how revocation reaches workers.

## Connection onboarding

Start personal Gmail authentication with the membership's Composio user ID. Bind the pending OAuth flow to that membership, tenant, expected toolkit, and callback state. Verify connection status and ownership server-side before accepting the result.

Let tenant administrators connect HubSpot using the tenant's connection-owner identity. Create an experimental SHARED connection with an explicit ACL of permitted membership user IDs. Pin the shared account into each authorized run. Do not use `allowAllUsers` to represent a tenant.

Handle denied consent, incomplete authentication, expired credentials, and account replacement in the connection UI. Block dependent work until the required accounts are active. Confirm the chosen HubSpot auth config and scopes support the intended reads.

Shared accounts have ACL size limits and do not reproduce individual CRM record permissions. Document these limits in the companion README. Verify SHARED account creation, grants, and execution in an isolated Composio project before describing that path as working. Do not silently fall back to a private account owned by an administrator.

## Agent and action execution

Resolve tenant, membership, and account IDs from application state. The model and browser cannot supply an arbitrary acting identity. Validate external inputs with schemas at entry points.

Create the run's session with `composio.sessions.create()` and restore it with `composio.sessions.use()`. Pin the selected accounts. Use `SessionPreset.DIRECT_TOOLS`, an exact read-tool allowlist, `manageConnections: false`, and `sandbox: { enable: false }`.

Discover and verify the actual Gmail and HubSpot tool slugs and schemas before coding. Record the tested tool set and SDK version in the companion. Keep tool execution under application control rather than handing the model an unrestricted executable client. Validate tool names and arguments, enforce budgets, and save the brief and email proposal in Postgres.

Render the sender, recipients, subject, and body on the approval screen. Treat edits as a new proposal version that needs fresh approval. Require the requesting employee to approve a send from their own mailbox. Commit the approval and action dispatch together.

The action worker rechecks current membership, connection grants, expiry, and policy version. It atomically claims the proposal before calling Composio. Create a separate send-only session and execute the stored payload without another model call. Disable sandbox and connection management there too. Expose no proxy, MCP endpoint, or alternate write path to the model.

Use separate agent and action status. Agent runs can be queued, running, completed, failed, cancelled, or `needs_connection`. Proposals can be pending, approved, rejected, expired, or superseded. Action attempts can be claimed, succeeded, failed, or `outcome_unknown`.

Do not automatically retry a claimed send after a timeout or crash. Disable retries for non-idempotent sends across the job runner, SDK, and HTTP client where supported. A recovered worker must treat an existing claim without a recorded result as uncertain. Reconcile with the provider where possible. Require review if delivery cannot be determined. A database claim is not a provider idempotency guarantee.

## Background work and lifecycle

Use a dispatcher for pending records so a process crash between database commit and job submission cannot lose work. Deduplicate redelivery with database constraints and stable run or action IDs.

Have scheduled occurrences create ordinary runs, with current authorization checks. Define missed-occurrence and daylight-saving behavior. Do not introduce a second agent implementation for schedules.

Persist sufficient state to resume reads and display progress after a worker restart. Surface reconnect requests through the application. Revalidate pending proposals after a connection or policy change.

On membership removal, block new work, disable schedules, cancel pending proposals, revoke shared ACL grants, and delete affected sessions. Retry failed cleanup without re-enabling application access. Define retention and deletion for conversations, drafts, job history, and execution logs. Keep API keys and OAuth links out of model context and ordinary logs.

## Acceptance scenarios

Demonstrate these behaviors with tests and a documented local run. Use fake provider responses for failures and writes until live tests are explicitly authorized.

- A member receives a brief using their private Gmail and the tenant's shared CRM connection.
- The same person in two tenants gets distinct Composio identities and cannot access the other tenant's connections, runs, or drafts.
- A browser-supplied foreign account ID, run ID, or approval ID is rejected.
- A model-requested send, proxy call, or code execution during the read phase is rejected.
- Rejection, expiry, and editing a proposal prevent the original send.
- Duplicate approval and job delivery result in one action claim.
- A crash after a send but before recording its result does not cause an automatic resend.
- Restarting the worker preserves a pending approval and completed read steps.
- Scheduled and interactive requests use the same account selection and policy logic.
- Revoked membership, a removed shared grant, and expired OAuth block subsequent work.
- A job-service outage leaves dispatch records pending and recoverable.
- Run budgets and per-tenant concurrency limits stop excess work and produce a visible status.

## Documentation delivery

Provide a README with prerequisites, environment variables, migrations, local startup, OAuth setup, job-runner setup, and reset instructions. Include the tested package versions and operational limits. Use sample credentials only as placeholders.

Link the companion from the architecture after its acceptance scenarios pass. Replace the planned-project callout with the real repository and run guide. Reconcile every diagram and responsibility statement with the implementation. Keep setup instructions in the companion, so the architecture page remains an explanation of the design.
