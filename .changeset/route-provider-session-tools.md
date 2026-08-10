---
'@composio/core': patch
'@composio/openai': patch
'@composio/anthropic': patch
---

Allow OpenAI and Anthropic provider tool-call helpers to execute through a supplied Tool Router session. Session meta-tools now retain their session context while provider argument normalization remains intact; existing user-ID calls continue to use direct execution.
