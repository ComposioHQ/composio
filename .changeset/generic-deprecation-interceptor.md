---
'@composio/core': minor
---

Surface API deprecations automatically via a generic response interceptor.

The SDK now inspects standard deprecation-signalling headers on every API
response and logs a one-time warning per deprecated operation:

- `Deprecation` (RFC 9745) — marks the operation as deprecated (presence gates
  the warning; the `@<epoch>` value is parsed into a date when available).
- `Sunset` (RFC 8594) — optional removal date; drives escalated wording as the
  date approaches or passes.
- `Link; rel="successor-version"` / `rel="deprecation"` (RFC 8288) — optional
  pointer to the replacement endpoint or migration docs.

Warnings dedupe by HTTP method + route template, so repeated calls (and calls
with different path params) collapse to a single warning. Two new client
options are available: `disableDeprecationWarnings` to silence the warnings and
`onDeprecation` to receive a structured `{ method, path, deprecatedAt, sunset,
successor }` payload for custom telemetry.

Because detection is header-driven and endpoint-agnostic, any endpoint
deprecated server-side is surfaced automatically with no SDK release required.
The previous endpoint-specific `connectedAccounts.initiate()` deprecation check
now flows through this generic mechanism.
