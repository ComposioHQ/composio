---
'@composio/google': minor
---

Allow the Google provider's `executeToolCall` helper to execute through a supplied Tool Router session, matching the OpenAI and Anthropic providers. Session meta-tools now retain their session context when called through this helper instead of `session.execute()` directly; existing user-ID calls continue to use direct execution unchanged. Custom provider subclasses overriding `executeToolCall` may require updates because this method now accepts session targets.
