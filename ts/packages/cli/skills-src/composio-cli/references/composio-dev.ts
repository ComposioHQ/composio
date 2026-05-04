import type { ReferenceDocument } from '../reference-schema';

export const composioDevReference: ReferenceDocument = {
  slug: 'composio-dev',
  title: 'Composio Dev',
  intro: [
    'Load this file only when the user explicitly needs developer-project workflows. Do not lead with `composio dev` for ordinary top-level CLI usage.',
  ],
  sections: [
    {
      title: 'Use `dev init` To Bind A Directory',
      body: [
        'Use `composio dev init` when the user wants to attach the current directory to a developer project.',
        'If later commands complain about missing developer project context, come back to `dev init`.',
      ],
      commands: [{ code: 'composio dev init -y --no-browser' }],
    },
    {
      title: 'Inspect Toolkits And Versions',
      body: ['Use toolkit commands to inspect developer-scoped capabilities:'],
      commands: [
        {
          code: 'composio dev toolkits list\ncomposio dev toolkits info github\ncomposio dev toolkits search "email"\ncomposio dev toolkits version github',
        },
      ],
    },
    {
      title: 'Manage Auth Configs',
      body: [
        'Use auth-config commands when the user is configuring developer-project authentication behavior:',
      ],
      commands: [{ code: 'composio dev auth-configs list' }],
    },
    {
      title: 'Manage Connected Accounts',
      body: [
        'Use developer connected-account commands when the user is working with developer-project users or auth-config-specific flows.',
        'Top-level `composio link` is consumer-only. Use `dev connected-accounts link` for developer-project flows.',
      ],
      commands: [{ code: 'composio dev connected-accounts list' }],
    },
    {
      title: 'Work With Triggers',
      body: [
        'Use trigger commands when the user is creating, inspecting, or listening to developer-project triggers.',
      ],
      commands: [
        {
          code: 'composio dev triggers list\ncomposio dev triggers info AGENT_MAIL_NEW_EMAIL_TRIGGER',
        },
      ],
    },
    {
      title: 'Inspect Logs',
      body: [
        'Use logs when the user is debugging tool executions or trigger deliveries inside a developer project.',
      ],
      commands: [{ code: 'composio dev logs tools\ncomposio dev logs triggers' }],
    },
    {
      title: 'Switch Or Inspect Org And Project Context',
      body: [
        'Use these commands when the user needs to confirm or change the active developer scope:',
        'If the user only wants to connect and execute tools as an end user, return to the top-level workflow instead of staying in `composio dev`.',
      ],
      commands: [{ code: 'composio dev orgs list\ncomposio dev projects list' }],
    },
  ],
};
