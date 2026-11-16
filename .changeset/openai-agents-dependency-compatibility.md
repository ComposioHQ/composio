---
'@composio/openai-agents': patch
'@composio/python-sdk': patch
---

Allow OpenAI Agents SDK 0.21 in the TypeScript provider's peer dependencies. Require composio 0.32.0 or newer for the Python OpenAI Agents provider so installs cannot retain an older core.
