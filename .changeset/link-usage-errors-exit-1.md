---
'@composio/cli': patch
---

`link` (and `dev connected-accounts link`) now fails with a usage error, printed on stderr with exit code 1, when the flags can't run: a toolkit together with `--auth-config`, neither a toolkit nor `--auth-config`, `--auth-config` without a developer project, and `--list` without a toolkit or with `--auth-config`. Before, these printed a message only when stderr was a terminal and exited 0, so scripts, CI and AI agents saw no output and a successful exit.
