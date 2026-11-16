---
'@composio/python-sdk': patch
---

Exclude the Claude Agent SDK provider's tests package from its wheel to avoid shadowing consuming projects' tests.
