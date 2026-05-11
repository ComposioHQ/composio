---
'@composio/core': patch
---

Add `accountType` and per-user ACL support for SHARED connected accounts.

- **`accountType` on create**: `composio.connectedAccounts.link(userId, authConfigId, { accountType: 'SHARED' })` creates a SHARED connection. Default remains `PRIVATE`. A SHARED connection can be used by other `userId`s, but only when the connection is explicitly pinned in a tool-router session's config and only when the requesting `userId` passes the connection's ACL.
- **`accountType` on retrieve**: `get()` and `list()` responses now include `accountType` (`'PRIVATE' | 'SHARED'`).
- **`aclConfigForShared` on create + retrieve**: per-user ACL block — `{ allowAllUsers, allowedUserIds, notAllowedUserIds }`. On responses the field is `undefined` when the caller isn't authorised to see the ACL, so callers can distinguish *"I can't see the ACL"* from *"ACL is the default deny-by-default state"*.
- **`updateAcl()` method** (new): `composio.connectedAccounts.updateAcl(nanoid, { allowAllUsers, allowedUserIds, notAllowedUserIds })` writes the ACL via `PATCH`. PATCH semantics — omit a field to leave it unchanged; pass an empty array to clear an allow/deny list. At least one field required. Calling on a PRIVATE connection raises `ComposioAclOnlyForSharedError` (400).
- **`ToolRouterSession.authorize()` options gain `accountType` + `aclConfigForShared`**, so a SHARED connection with an ACL can be created in one call from inside a tool-router session.

ACL resolution rule (deny wins):

1. requesting `userId` ∈ `notAllowedUserIds` → DENY
2. `allowAllUsers === true` → ALLOW
3. requesting `userId` ∈ `allowedUserIds` → ALLOW
4. otherwise → DENY (deny-by-default)

Limits: each ACL list accepts up to 1000 entries; each `userId` is 1..256 characters. The SDK enforces these caps at the input boundary.

New error classes:

- `ComposioSharedAccessDeniedError` (403) — surfaces from direct `connectedAccountId` execution paths when the requesting user fails the ACL.
- `ComposioAclOnlyForSharedError` (400) — ACL fields sent on a PRIVATE connection.
- `ComposioSharedConnectionNotAccessibleError` (400) — tool-router session create / PATCH with a pinned SHARED connection the session user cannot use.

No breaking changes. Existing `link()` callers without the new options get a `PRIVATE` connection exactly as today; existing `get()` / `list()` callers see new optional fields.

The Python SDK mirror ships in a separate PR.
