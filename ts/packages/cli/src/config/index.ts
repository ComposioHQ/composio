/**
 * Every environment variable the CLI reads, grouped by purpose:
 *
 * - `APP_CONFIG`       — `COMPOSIO_*` settings users configure (README "Configuration")
 * - `DEBUG_CONFIG`     — diagnostics toggles and `DEBUG_OVERRIDE_*` developer overrides
 * - `TELEMETRY_CONFIG` — telemetry opt-outs and the PostHog target
 * - `HOST_CONFIG`      — facts about the launching shell, CI, package manager, and agent host
 * - `GITHUB_CONFIG`    — where releases and skills are fetched from
 *
 * Variables are named in full and read through the ambient `effect/ConfigProvider`, which
 * defaults to the process environment. Tests provide `ConfigProvider.fromEnvRecord({...})`.
 * Add a new variable to the catalog it belongs to rather than reading it where it is used.
 */
export { APP_CONFIG } from './app';
export { DEBUG_CONFIG } from './debug';
export { TELEMETRY_CONFIG } from './telemetry';
export { HOST_CONFIG, type AgentHostEnvironment, type CallerAgentSignals } from './host';
export { GITHUB_CONFIG, GITHUB_REPAIR_CONFIG, type GitHubConfig } from './github';
