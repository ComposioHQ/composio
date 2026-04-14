---
"@composio/cli": patch
---

feat: add `simple`, `default`, and `verbose` help verbosity modes to root and subcommand help (`--help simple|verbose`); compact simple mode and richer verbose mode with additional commands (#3205)
feat: add `composio connections list` command that groups connected accounts by toolkit and displays aliases (#3206)
feat: migrate API key storage from plaintext `~/.composio/user_data.json` to OS keyring (macOS Keychain / Linux Secret Service); env var > keyring > legacy plaintext precedence with one-shot migration and `dangerouslySaveApiKeyInUserConfig` opt-out for headless environments (#3202)
feat: turn `composio dev` into a real developer-mode toggle backed by CLI user config; gate the `init`, `tools execute`, `triggers listen`, `logs`, `toolkits`, `auth-configs`, `connected-accounts`, `triggers`, and `projects` subcommand tree behind the toggle, and remove deprecated destructive `delete`/`info` commands now covered by the dev-mode gate (#3181)
feat: enable `multi_account` experimental feature by default for stable CLI builds and centralize default experimental-feature behavior so runtime config and skill reference schema stay in sync (#3163)
