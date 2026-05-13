---
"@composio/cli": patch
---

`composio upgrade` now accepts an optional `<version>` argument so you can install a specific stable release or beta (e.g. `composio upgrade 0.13.1`, `composio upgrade 0.13.1-beta.42`, or the full tag `@composio/cli@0.13.1`). When omitted, the command continues to install the latest release on the chosen channel (`--beta` for prereleases).
