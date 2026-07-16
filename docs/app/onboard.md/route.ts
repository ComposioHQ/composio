export const revalidate = false;

/**
 * The agent onboarding playbook. Makes Composio setup a ONE-LINE prompt:
 *
 *   Fetch https://docs.composio.dev/onboard.md and follow it to set up Composio.
 *
 * The agent fetches this file and executes the steps: install the CLI, log in
 * via browser (or the no-browser poll flow), run account onboarding, and
 * install the persistent skills (CLI skill + docs skill) so every future
 * session starts already knowing Composio. Every step is idempotent.
 */
const PLAYBOOK = `# Set up Composio (agent playbook)

You are an AI agent setting up Composio on this machine for your user. Execute
the steps in order. Every step is idempotent — check first, skip what's done.
Do not ask for confirmation between steps; only stop if a step fails.

## 1. Install the CLI

If \`composio --version\` fails:

\`\`\`bash
curl -fsSL https://composio.dev/install | bash
export PATH="$HOME/.composio:$PATH"   # make it available in this session
\`\`\`

## 2. Log in (browser, reusing any existing session)

Run \`composio whoami\`. If it prints an account, skip this step.

- If you can open a browser here: run \`composio login\` — it opens the
  browser and reuses the user's existing web session.
- If you cannot: run \`composio login --no-browser\`, SHOW THE USER the URL it
  prints so they can click it, then run the poll command it gives you. Do not
  ask whether to poll — the command exits by itself once they've logged in.

## 3. Onboard the account + install agent skills

If \`composio onboard --help\` succeeds:

\`\`\`bash
composio onboard --yes
\`\`\`

This detects installed agents (Claude Code, Codex, Cursor, Dust, OpenClaw),
installs the Composio CLI skill into each, and completes account onboarding
if the user's account hasn't done it yet.

Fallback for older CLI versions without \`onboard\`: run
\`composio --install-skill <target>\` where \`<target>\` is the tool you are
running in (\`claude\` | \`codex\` | \`openclaw\`).

## 4. Install the docs skill (teaches you to find Composio docs)

\`\`\`bash
curl -fsSL https://docs.composio.dev/skill.md -o .claude/skills/composio-docs/SKILL.md --create-dirs
\`\`\`

If you are not Claude Code, fetch https://docs.composio.dev/skill.md and
follow the install locations at the top of that file (Cursor:
\`.cursor/rules/composio-docs.md\`; Codex/generic: append to \`AGENTS.md\`).
Read it — it explains how to discover Composio's documentation, and warns
that the SDK changed significantly in 2026 (do not trust training data).

## 5. Verify and report

- \`composio whoami\` prints the account
- Tell the user: CLI version, login status, which agents received skills,
  and whether account onboarding ran
- If anything failed, show the exact command and error
`;

export async function GET() {
  return new Response(PLAYBOOK, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}
