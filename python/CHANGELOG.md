# Changelog

All notable changes to the Composio Python SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> Versions between `0.8.11` and `0.13.0` were released without CHANGELOG entries. See the [Git commit log](https://github.com/ComposioHQ/composio/commits/next/python) for changes in that window.

## [0.17.1] - 2026-06-28

### Added
- **Tool Router session deletion**: delete sessions from Python via `composio.sessions.delete(session_id)` or `session.delete()`, matching the TypeScript SDK surface.

### Changed
- Bumped the Python SDK and provider packages from `0.17.0` to `0.17.1`.

## [0.17.0] - 2026-06-26

### Added
- **`triggers.parse()`**: parse and optionally verify an incoming webhook request, mirroring the TypeScript SDK. Pass `verify_secret` to validate the signature; omit it to skip verification explicitly. A present-but-empty `verify_secret` (e.g. an unset `COMPOSIO_WEBHOOK_SECRET`) raises rather than silently skipping verification.
- **`triggers.set_webhook_subscription()`**: create or update the project webhook subscription from the Python SDK.
- **`connected_accounts.update_acl()`**: the experimental shared-connection ACL patch helper graduated to `connected_accounts`; `experimental.update_acl()` remains as a deprecated alias.

### Changed
- **`composio.sessions` is the canonical sessions entrypoint**: use `composio.sessions.create(...)` (or the `composio.create` / `composio.use` shortcuts). `composio.tool_router` is now a deprecated alias for the same object.
- **MCP is now opt-in for sessions**: `composio.create()` / `composio.use()` return native-tool sessions by default and select the MCP-typed session only when `mcp=True`. The runtime object is unchanged.
- **Prefer `sandbox` for session code-execution config**: the `sandbox` key is now preferred; the existing `workbench` key is still accepted as an alias.
- Bumped the Python SDK and provider packages from `0.16.0` to `0.17.0`.

## [0.16.0] - 2026-06-25

### Fixed
- **Auto file upload/download behind `$ref`/`$defs`**: tool schemas that express their file fields through a `$ref`/`$defs` indirection are now resolved before file handling, so `file_uploadable` inputs and `file_downloadable` outputs reachable only through a reference are no longer silently skipped when `dangerously_allow_auto_upload_download_files=True`. `GMAIL_GET_ATTACHMENT` (whose `file_downloadable` flag sits two `$ref` hops deep) is the canonical case. Adds a cycle-safe, depth-capped `dereference_json_schema` utility with Draft 2020-12 sibling-keyword merge, mirroring the TypeScript SDK's `dereferenceJsonSchema`.
- **No retries on non-idempotent tool writes**: `tools.execute()` and `tools.proxy()` are non-idempotent POST writes, but the Stainless-generated client retried them by default (on read timeouts, 429s, and 5xx), which could duplicate side effects — e.g. send an email twice. Both paths now route through a cached `client.without_retries` clone (`max_retries=0`); idempotent reads and lists keep the default retries. This is an interim fix ahead of backend idempotency keys.
- **Bounded timeouts on file transfers**: session file uploads/downloads and the presigned S3 `PUT`/`GET` paths now use bounded `(connect, read)` timeouts, and timeout or request failures surface as the SDK's typed file errors instead of hanging.
- **Provider-visible tool schema aliasing**: centralized aliasing via `alias_tool_input_schema` / `restore_tool_arguments`, applied across the Anthropic, Claude Agent SDK, Gemini, Google ADK, and OpenAI Agents providers. Aliases invalid Python parameter names (e.g. `$top`), preserves the existing `from` → `from_rs` style, avoids leading-underscore aliases so Pydantic-backed providers can build models, caps aliases at 64 characters for Anthropic-style validators, and dereferences internal `$ref`/`$defs` before aliasing. Original backend argument names are restored before execution.
- **OpenAI Agents schema mutation**: the tool schema is now deep-copied before its `examples`/`default` fields are stripped, so the source schema is no longer mutated in place.

### Changed
- Bumped the `composio-client` dependency from `1.39.0` → `1.41.0`.
- Bumped the Python SDK and provider packages from `0.15.0` to `0.16.0`.
- Refreshed Python core and provider dependency ranges, plus root and provider uv locks, to the newest compatible versions.

## [0.15.0] - 2026-06-16

### Fixed
- Forwarded `user_id` from `triggers.create(..., user_id=...)` into the trigger upsert request via `extra_body`, so 2FA-enabled trigger projects can verify the pinned connected account belongs to the caller.

### Changed
- Bumped the Python SDK and provider packages from `0.14.0` to `0.15.0`.

## [0.14.0] - 2026-06-05

### Removed
- Removed the legacy `composio.tools.custom_tool` registry path, including `core.models.custom_tools`, `ExecuteRequestFn`, the old fallback execution wiring, the old security tests, and the legacy custom-tools example.

### Changed
- Kept custom tools on the 2026 tool-router surface: `composio.experimental.tool()`, `composio.experimental.Toolkit`, inline execution, preload/attach/use flows, and `session.custom_tools()`.
- Bumped the Python SDK and provider packages from `0.13.1` to `0.14.0`.

## [0.13.1] - 2026-05-13

### Added
- **SHARED connected accounts (experimental)**: Connections can now be marked SHARED at create time and reached from a tool-router session by other `user_id`s when explicitly pinned and authorised via a per-user ACL. Mirrors the TypeScript SDK's `@composio/core@0.10.0` release.
  - `composio.connected_accounts.link(..., experimental={"account_type": "SHARED", "acl_config_for_shared": {...}})` to create.
  - `composio.experimental.update_acl(nanoid, allow_all_users=..., allowed_user_ids=[...], not_allowed_user_ids=[...])` to update the per-user ACL on an existing SHARED connection. PATCH semantics: omit a field to leave it unchanged; pass `[]` to clear an allow/deny list.
  - `session.authorize(toolkit, experimental={...})` for the same flow inside a tool-router session.
  - `composio.connected_accounts.list(account_type='PRIVATE' | 'SHARED' | 'ALL')` filter.
  - New typed errors: `ComposioAclOnlyForSharedError`, `ComposioSharedAccessDeniedError`, `ComposioSharedConnectionNotAccessibleError`.
  - **Experimental — shape may change in future releases.** Pinning a SHARED connection in a session config and direct execute by `connected_account_id` are unchanged.
- **`composio.experimental` namespace**: new module housing experimental SDK methods that take a client (`update_acl`) alongside the existing decorators (`tool`, `Toolkit`).

### Fixed
- **`initiate()` deprecation warning false-positives**: the legacy `POST /api/v3/connected_accounts` deprecation warning is now gated on the response `Deprecation` HTTP header (RFC 9745) rather than the `auth_scheme` of the request. Custom auth configs and non-OAuth schemes no longer trigger a spurious warning. The legacy endpoint's retired-path 400 is also surfaced as a typed `ComposioLegacyConnectedAccountsEndpointRetiredError`. See https://docs.composio.dev/docs/changelog/2026/04/24.
- **Schema converter nullability**: `null`-only `anyOf` blocks now preserve nullability instead of dropping to a bare `str` fallback.

### Changed
- Bumped `composio-client` dependency from `1.36.0` → `1.39.0` so the generated typed client carries the `Experimental` TypedDicts for the SHARED-connection surface.

## [0.8.11] - 2025-09-10

### Added
- **Composio Connect Link Support**: New link() method for creating external authentication links
  - Added `link()` method to ConnectedAccounts class for generating user authentication links
  - Support for callback URL redirection after authentication
  - Enhanced user experience with external link-based authentication flow
  - Includes comprehensive documentation and usage examples

### Fixed
- **Documentation**: Fixed typo in connected account creation function docstring
  - Corrected "coneected" to "connected" in function documentation

## [0.8.10] - 2024-12-19

### Added
- **LlamaIndex Provider**: New LlamaIndex provider for enhanced AI framework integration
  - Complete provider implementation with demo and documentation (`python/providers/llamaindex/`)
  - Support for LlamaIndex-specific tool execution patterns
  - Includes provider.py, demo script, and proper packaging setup

### Changed
- **Schema Parsing**: Improved OpenAPI schema parsing with default fallback to 'any' type for invalid schemas
  - Enhanced `python/composio/utils/openapi.py` to handle malformed schemas gracefully
  - More robust type inference for edge cases where schema type is missing or invalid

### Fixed
- **Type Checking**: Fixed type checking issues in core validation logic
  - Updated `python/composio/core/models/toolkits.py` for better type safety
  - Added proper type annotations and validation
- **Sentinel Value Checks**: Fixed sentinel value validation in core models
  - Enhanced validation in `python/composio/core/models/toolkits.py`
  - Improved handling in `python/composio/core/models/tools.py` and `python/composio/core/models/triggers.py`
  - Added proper sentinel value checks in `python/composio/types.py`
- **Build System**: Updated noxfile.py for improved development workflow

## [0.8.9] - 2024-11-XX

### Added
- Initial stable release with core functionality
- Support for multiple AI frameworks (OpenAI, Anthropic, Google, etc.)
- Comprehensive tool execution capabilities
- Authentication and connected account management
- File upload and download support
- Webhook and trigger system
- Multi-provider support architecture

### Features
- Tool discovery and execution
- Connected account management
- Authentication configuration
- File handling and processing
- Webhook integration
- Trigger system for automated workflows
- Support for custom tools and integrations

---

## Version History

For detailed commit history and technical changes, see the [Git commit log](https://github.com/composio/composio/commits/main).

## Support

For questions, issues, or contributions, please visit:
- [GitHub Repository](https://github.com/composio/composio)
- [Documentation](https://docs.composio.dev)
- [Community Discord](https://discord.gg/composio)
