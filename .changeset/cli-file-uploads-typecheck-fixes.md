---
"@composio/cli": patch
---

fix: hydrate file_uploadable tool inputs and add temp-file handling for execute payloads
fix: surface in-band tool errors as warnings without overriding successful execution results
fix: resolve 8 TypeScript strict-mode errors blocking CLI build in run-helpers-runtime
refactor: extract run helper runtime (~650 lines) from run.cmd.ts into run-helpers-runtime.ts
