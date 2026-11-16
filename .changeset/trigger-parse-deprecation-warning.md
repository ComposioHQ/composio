---
'@composio/core': patch
'@composio/slim': patch
'@composio/python-sdk': patch
---

Warn when a trigger delivery runs on a deprecated toolkit version

`triggers.parse()` now reads the `Composio-Deprecated-Toolkits` header on a webhook delivery and warns once per process for each deprecated toolkit version a trigger runs on, for example `Trigger GITHUB_COMMIT_EVENT (ti_abc123) runs on GITHUB version 20251027_00, deprecated on 2026-10-29. It will be retired on 2027-01-29.` TypeScript logs it through the SDK logger and Python issues a `ComposioDeprecationWarning`. With `verifySecret` / `verify_secret`, only a verified delivery warns. A trigger warning is remembered apart from the tool-call warning for the same version, so seeing one does not silence the other. Deliveries without the header behave as before.
