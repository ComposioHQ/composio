# Changelog

All notable changes to the Composio project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **CLI: Global org/project switch and list commands** — Switch between organizations and projects directly from the CLI ([#2793](https://github.com/ComposioHQ/composio/pull/2793))
- **CLI: Enhanced init and tool-router based tool discovery** — Improved onboarding flow with smarter tool discovery ([#2767](https://github.com/ComposioHQ/composio/pull/2767))

### Fixed

- **CLI: Add toolkit fallback and toolkit version command** — Graceful fallback when toolkit isn't found, plus new `toolkit version` command ([#2784](https://github.com/ComposioHQ/composio/pull/2784))
- **CLI: Fallback to global test user id for action commands** ([#2781](https://github.com/ComposioHQ/composio/pull/2781))
- **CLI: Send x-user-api-key and use COMPOSIO_USER_API_KEY** — Proper API key propagation ([#2779](https://github.com/ComposioHQ/composio/pull/2779))
- **CLI: Use nano IDs in login and simplify org project list headers** ([#2773](https://github.com/ComposioHQ/composio/pull/2773))
- **CLI: Preserve test user id fallback on login** ([#2775](https://github.com/ComposioHQ/composio/pull/2775))

### Documentation

- **Comparison guides** — Native Tools vs MCP, Sessions vs Direct Execution ([#2803](https://github.com/ComposioHQ/composio/pull/2803))
- **Background agent cookbook** — New cookbook for building background agents ([#2801](https://github.com/ComposioHQ/composio/pull/2801))
- **Comprehensive CLI reference** — Full CLI command reference page ([#2790](https://github.com/ComposioHQ/composio/pull/2790))
- **Improved cross-linking** across all documentation pages ([#2800](https://github.com/ComposioHQ/composio/pull/2800))
- **New cookbooks** — Support knowledge agent ([#2770](https://github.com/ComposioHQ/composio/pull/2770)), App Connections Dashboard ([#2768](https://github.com/ComposioHQ/composio/pull/2768)), rewritten Supabase SQL agent with sessions ([#2764](https://github.com/ComposioHQ/composio/pull/2764)), rewritten tool type generator ([#2766](https://github.com/ComposioHQ/composio/pull/2766))
- **API docs** — Clarify `toolkit_versions` default behavior in Get Tools API ([#2796](https://github.com/ComposioHQ/composio/pull/2796))
- **Internal** — Replace hardcoded `IGNORED_PATHS` with `x-internal` tag filter ([#2795](https://github.com/ComposioHQ/composio/pull/2795))
- Removed outdated Full Stack Chat App cookbook ([#2765](https://github.com/ComposioHQ/composio/pull/2765))

### Chores

- Bump dependencies ([#2778](https://github.com/ComposioHQ/composio/pull/2778))
- Relax mastra hackernews karma assertion in e2e tests ([#2783](https://github.com/ComposioHQ/composio/pull/2783))
