import type { ReferenceDocument } from '../reference-schema';

export const troubleshootingReference: ReferenceDocument = {
  slug: 'troubleshooting',
  title: 'Troubleshooting',
  intro: ['Load this file when the user is stuck on top-level Composio CLI flows.'],
  sections: [
    {
      title: 'Not Logged In',
      body: [
        'Symptoms:',
        '- `composio` commands fail because there is no user session',
        '- the user is unsure which account the CLI is using',
        'Fix:',
        'If `composio whoami` fails, run `composio login` and then return to the original `execute` or `search` flow.',
      ],
      commands: [{ code: 'composio whoami' }],
    },
    {
      title: 'No Active Connection Found',
      body: [
        'Symptoms:',
        '- `execute` reports that no active connection exists for a toolkit',
        'Fix:',
        'After linking, retry the exact same `execute` command.',
      ],
      commands: [
        {
          code: 'composio link gmail --no-browser --no-wait\ncomposio link googlecalendar --no-browser --no-wait',
        },
      ],
    },
    {
      title: 'Invalid JSON Input',
      body: [
        'Symptoms:',
        '- `execute` rejects `-d` input',
        '- the payload is not valid JSON or JS-style object syntax',
        'Fix:',
        '- Pass JSON or a JS-style object literal to `-d`',
        '- Use `@file` for large payloads',
        '- Use `-` to read from stdin',
        'Examples:',
      ],
      commands: [
        {
          code: `composio execute GITHUB_CREATE_AN_ISSUE --skip-connection-check --dry-run -d '{"owner":"acme","repo":"app","title":"Bug report","body":"Steps to reproduce..."}'
composio execute GITHUB_CREATE_AN_ISSUE --skip-connection-check --dry-run -d '{ owner: "acme", repo: "app", title: "Bug report", body: "Steps to reproduce..." }'
composio execute GITHUB_CREATE_AN_ISSUE --skip-connection-check --dry-run -d @payload.json
cat payload.json | composio execute GITHUB_CREATE_AN_ISSUE --skip-connection-check --dry-run -d -`,
        },
      ],
    },
    {
      title: 'Unknown Or Wrong Slug',
      body: [
        'Symptoms:',
        '- the user does not know the tool slug',
        '- the slug exists but is not the right tool for the job',
        'Fix:',
        'Use multiple queries in one `search` call when the user is exploring several related tasks at once. Use `composio tools list <toolkit>` only when the user already knows the toolkit and needs to browse the available slugs manually.',
      ],
      commands: [
        {
          code: 'composio search "create a github issue"\ncomposio search "send an email" --toolkits gmail\ncomposio search "send an email" "create a github issue"',
        },
      ],
    },
    {
      title: 'Confusion About Required Inputs',
      body: [
        'Symptoms:',
        '- the user is unsure what fields a tool accepts',
        '- the first payload attempt failed validation',
        'Fix:',
        'Use `composio tools info <slug>` only when the user wants a compact summary of a known slug and the `execute --get-schema` output is still not enough.',
      ],
      commands: [
        {
          code: `composio execute GITHUB_CREATE_AN_ISSUE --get-schema -d '{}'\ncomposio execute GITHUB_CREATE_AN_ISSUE --skip-connection-check --dry-run -d '{ owner: "acme", repo: "app", title: "Bug report", body: "Steps to reproduce..." }'`,
        },
      ],
    },
    {
      title: 'Several Independent Tool Calls',
      body: [
        'Symptoms:',
        '- the user wants to run multiple unrelated tools in one step',
        '- the user is about to write a script only to execute a few independent calls',
        'Fix:',
        'Escalate to `composio run` only when the user needs control flow, loops, `Promise.all`, `search()` inside a script, `proxy()`, or `experimental_subAgent()`.',
      ],
      commands: [
        {
          code: `composio execute --parallel \\\n  GMAIL_SEND_EMAIL -d '{ recipient_email: "a@b.com", subject: "Hi" }' \\\n  GITHUB_CREATE_AN_ISSUE -d '{ owner: "acme", repo: "app", title: "Bug" }'`,
        },
      ],
    },
    {
      title: '`tools info` And `tools list` Are Fallbacks',
      body: [
        'Treat these commands as secondary inspection tools:',
        'Do not lead with them when `execute`, `search`, `--get-schema`, or `--dry-run` can get the user unstuck faster.',
      ],
      commands: [{ code: 'composio tools info GMAIL_SEND_EMAIL\ncomposio tools list gmail' }],
    },
    {
      title: 'Consumer Vs `composio dev`',
      body: [
        'Use the top-level commands for normal end-user flows:',
        '- `composio execute`',
        '- `composio search`',
        '- `composio link`',
        '- `composio run`',
        '- `composio proxy`',
        'Load [composio-dev.md](composio-dev.md) only when the user explicitly needs developer projects, auth configs, connected accounts, triggers, logs, orgs, or projects.',
      ],
    },
  ],
};
