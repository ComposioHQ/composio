# Iteration 3 difficulties

Third loop plus additional human feedback surfaced remaining issues after PR #3446 was created.

## Claude/Codex third-pass findings

1. **Session lifecycle contradiction survived in FAQ and glossary**
   - `common-faq.mdx` still said users do not need to store/manage session IDs.
   - `glossary.mdx` still called sessions ephemeral and immutable.
   - This conflicted with `users-and-sessions`, `how-composio-works`, and quickstart guidance to reuse sessions with `composio.use()` and update with `session.update()`.

2. **Root legacy redirects landed on non-routable folder paths**
   - `/docs/tools-direct`, `/docs/auth-configuration`, `/docs/modify-tool-behavior`, `/docs/tools/modify`, and `/docs/modifiers` could redirect to folders with no page.
   - Fix required exact redirects to real leaf docs and integration test coverage.

3. **Sessions vs Direct Execution still made direct execution sound too peer-level**
   - The page needed stronger “legacy/maintenance path” labeling in both intro and Direct Execution section.

4. **Old Tool Router terminology leaked into observability docs**
   - `tool router session` appeared in Logs/Usage filter descriptions.

5. **Claude Code Plugin title and positioning needed clarity**
   - The title `Plugin` was ambiguous under MCP & Clients.
   - Human feedback preferred a skill/plugin/CLI onboarding path over manual MCP server setup.

## Additional human feedback captured

1. **Configuring sessions does not explain ending sessions**
   - There is no explicit end/delete method or TTL documented.
   - Human preference: delete and/or TTL for sessions, similar to subagents.
   - Current docs should state the present behavior clearly without promising an API that does not exist.

2. **Agent signup claim flow is ambiguous**
   - Docs said `invite_code`.
   - Live API may return `claim_slug` and `expires_at` with no `invite_code`.
   - CLI may return `status: invited`, `org_id`, `invite_code: null`, and no `claim_slug`/`expires_at`.
   - `status: invited` does not prove email delivery or human acceptance.
   - Docs need current response-shape guidance, `claim_slug` meaning, null invite code handling, safe redacted verification, and troubleshooting for missing email vs upstream 502s.

3. **Sessions vs Direct Execution wording confused users**
   - The page needed clearer warning that direct execution is legacy/maintenance, not equal recommendation.

4. **Theme should default to system**
   - Docs rendered light while the user's system was dark.

5. **Projects page sounded enterprise-only**
   - It needed wording that projects are useful for both regular app development and enterprise/team isolation.

6. **Icon-forward docs are easier to scan**
   - Cognee docs were cited as easier to understand at first glance because of icons.
   - Current response: keep using icon cards and consider more icon-forward summaries in future content passes.

7. **Claude Code Plugin should prefer skills/CLI onboarding over manual MCP**
   - Docs should steer Claude Code users to plugin/skills and away from fragile manual MCP server setup.

8. **Observability Logs may need Raindrop integration guidance**
   - Human asked whether Raindrop integration is possible because many agent builders use it.
   - This remains a product/docs follow-up unless a native integration exists.

9. **Webhook verification belongs in Triggers**
   - Current sidebar already places `webhook-verification` under Triggers; preserve that.

## Fixes applied from this pass

- Updated FAQ and glossary session lifecycle wording.
- Added a Configuring Sessions lifecycle section that explicitly says there is no end/delete/TTL today.
- Strengthened Sessions vs Direct Execution legacy labeling.
- Fixed root legacy redirects and added integration test cases.
- Replaced Tool Router terminology in observability filter descriptions.
- Switched docs theme default to `system`.
- Clarified Projects page regular vs enterprise use.
- Clarified Claude Code Plugin title and plugin/skills-first path.
- Updated Agent Signup claim response docs and troubleshooting.
