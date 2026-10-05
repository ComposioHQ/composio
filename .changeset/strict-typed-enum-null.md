---
'@composio/core': patch
---

Allow optional typed enum and const parameters to be omitted in strict tool schemas. Preserve all value constraints when adding the null branch, and drop null arguments when the original enum or const rejects them.

Guard recursive null checks against cyclic local references while still checking non-recursive nullable alternatives.
