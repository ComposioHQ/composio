---
'@composio/core': patch
---

Stop dropping `is_secret`, `legacy_template_name` and `auth_hint_url` from toolkit auth config details. `transformToolkitRetrieveResponse` passed the auth field groups through unchanged, so the snake_case keys never matched `ToolkitAuthFieldSchema` and zod stripped them during validation; `auth_hint_url` was never mapped at all. Fields returned by `toolkits.getConnectedAccountInitiationFields()` and `toolkits.getAuthConfigCreationFields()` now carry `isSecret`, which the API documents as the signal for whether a client should mask the input, plus `legacyTemplateName`; auth config details returned by `toolkits.get()` now carry `authHintUrl`. Each of these keys is present only when the API sends it, so spreading a field no longer overwrites a caller's own fallback with `undefined`.
