---
'@composio/google': minor
'@composio/cloudflare': minor
'@composio/openai': minor
---

Allow the Google and Cloudflare providers' `executeToolCall` and the OpenAI Responses provider's `handleResponse` to execute through a supplied Tool Router session, matching the other provider helpers. Session meta-tools now keep their session context through these helpers. Existing user-ID calls keep using direct execution unchanged, and the Cloudflare `options` argument is now optional. Passing a session requires `@composio/core` 0.17.0 or later. Custom provider subclasses overriding these methods may require updates because they now accept session targets.
