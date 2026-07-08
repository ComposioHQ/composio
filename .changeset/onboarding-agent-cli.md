---
'@composio/cli': minor
---

One-command setup and agent-friendly CLI surfaces. `composio onboard --yes` now runs browser login, account onboarding, and installs both the CLI skill and the new docs skill (fetched live from docs.composio.dev/skill.md) into every detected coding agent; the install script and npm postinstall auto-run it. New commands: `composio docs <query>` / `--page <path>` (search or print docs from the terminal), `composio status` (machine-readable setup probe). `composio dev triggers create --if-missing` makes trigger setup idempotent, and unknown commands now suggest `composio upgrade` so stale installs self-heal.
