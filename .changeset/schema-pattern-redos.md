---
'@composio/json-schema-to-zod': patch
'@composio/core': patch
---

Tool schema `pattern` and `patternProperties` regexes now run on a linear-time engine (RE2, via `re2js`), so a hostile pattern such as `^(a+)+$` can no longer hang argument validation. A `pattern` that needs lookaround still runs on the native engine when a static check shows it cannot backtrack catastrophically, on input up to 1000 characters; otherwise it is left unenforced. A `patternProperties` key that needs lookaround or a backreference now fails conversion with an `InvalidPatternError` (reason `unsupported`). Patterns now match astral characters (emoji) as single characters, as JSON Schema's Unicode regex dialect does.
