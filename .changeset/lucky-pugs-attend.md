---
'@composio/experimental': patch
---

Stamp eve's durable callback descriptors on the tools `EveProvider` wraps. eve only stamps descriptors on `defineTool` calls it finds in an agent's own source, so tools built inside `node_modules` were rejected at resolve time and every Composio tool was dropped from the step. Each wrapped tool now persists only its slug and an id for the resolve that produced it, and re-attaches to that resolve's Composio executor when eve replays or resumes a parked call.
