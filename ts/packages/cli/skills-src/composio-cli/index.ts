import * as fs from 'node:fs';
import * as path from 'node:path';
import { CLI_EXPERIMENTAL_FEATURES } from '../../src/constants';
import { composioDevReference } from './references/composio-dev';
import { powerUserExamplesReference } from './references/power-user-examples';
import { troubleshootingReference } from './references/troubleshooting';
import {
  renderReferenceDocument,
  resolveSkillBuildContext,
  validateReferenceDocument,
  type SkillBuildContext,
  type SkillFeatureFlag,
  type SkillReleaseChannel,
} from './reference-schema';

type SkillFlag = {
  description: string;
  name: string;
  features?: SkillFeatureFlag[];
};

type SkillExample = {
  code: string;
  description?: string;
  features?: SkillFeatureFlag[];
};

type SkillCommand = {
  id: string;
  title: string;
  summary?: string;
  features?: SkillFeatureFlag[];
  intro?: string[];
  flags?: SkillFlag[];
  examples?: SkillExample[];
  notes?: string[];
  extraBody?: Array<{
    features?: SkillFeatureFlag[];
    markdown: string;
  }>;
};

const isEnabledForBuild = (build: SkillBuildContext, entry?: { features?: SkillFeatureFlag[] }) =>
  !entry?.features || entry.features.every(feature => build.experimentalFeatures[feature]);

const sourceAssetsDir = path.resolve(import.meta.dirname, './assets');

const frontmatter = {
  name: 'composio-cli',
  description:
    'Help users operate the published Composio CLI to find the right tool, connect accounts, inspect schemas, execute tools, subscribe to trigger events with `composio listen`, script workflows with `composio run`, and call authenticated app APIs with `composio proxy`. Use when the user asks how to do something with `composio`, wants to run a known tool slug, needs to discover a slug with `composio search`, fix a missing connection with `composio link`, inspect tool inputs with `--get-schema` or `--dry-run`, troubleshoot top-level CLI flows, or explicitly needs `composio dev` guidance.',
};

const commands: SkillCommand[] = [
  {
    id: 'execute',
    title: '`execute` - Run A Tool',
    summary: 'Use `execute` when the tool slug is already known.',
    flags: [
      {
        name: '`--get-schema`',
        description: 'Inspect required arguments without executing the tool.',
      },
      {
        name: '`--dry-run`',
        description: 'Preview the request shape without performing the action.',
      },
      {
        name: '`--file`',
        description:
          'Inject a local file path into a tool that exposes exactly one uploadable file argument.',
      },
      {
        name: '`--parallel`',
        description: 'Execute multiple independent tool calls in the same invocation.',
      },
    ],
    examples: [
      {
        code: "composio execute GITHUB_GET_THE_AUTHENTICATED_USER -d '{}'",
      },
      {
        description: 'Inspect required inputs without executing',
        code: 'composio execute GITHUB_CREATE_AN_ISSUE --get-schema',
      },
      {
        description: 'Preview safely',
        code: 'composio execute GITHUB_CREATE_AN_ISSUE --skip-connection-check --dry-run -d \'{ owner: "acme", repo: "app", title: "Bug report", body: "Steps to reproduce..." }\'',
      },
      {
        description: 'Pass data from a file or stdin',
        code: 'composio execute GITHUB_CREATE_AN_ISSUE -d @issue.json\ncat issue.json | composio execute GITHUB_CREATE_AN_ISSUE -d -',
      },
      {
        description: 'Upload a local file',
        code: 'composio execute SLACK_UPLOAD_OR_CREATE_A_FILE_IN_SLACK \\\n  --file ./image.png \\\n  -d \'{ channels: "C123" }\'',
      },
      {
        description: 'Run independent tool calls in parallel',
        code: 'composio execute --parallel \\\n  GMAIL_SEND_EMAIL -d \'{ recipient_email: "a@b.com", subject: "Hi" }\' \\\n  GITHUB_CREATE_AN_ISSUE -d \'{ owner: "acme", repo: "app", title: "Bug" }\'',
      },
    ],
    notes: [
      '`--file` only works when the tool exposes a single uploadable file input. Otherwise use explicit `-d` JSON.',
    ],
  },
  {
    id: 'search',
    title: '`search` - Find The Slug',
    summary: 'Use `search` only when the tool slug is not already known.',
    examples: [
      {
        code: 'composio search "create a github issue"\ncomposio search "send an email" --toolkits gmail\ncomposio search "send an email" "create a github issue"\ncomposio search "my emails" "my github issues" --toolkits gmail,github',
      },
    ],
    notes: [
      'Batch related discovery work into one `search` invocation, then move back to `execute` once the correct slugs are known.',
    ],
  },
  {
    id: 'link',
    title: '`link` - Connect An Account',
    summary:
      'Use `link` when `execute` reports that a toolkit is not connected, or when the user explicitly wants to authorize an account.',
    examples: [
      {
        code: 'composio link gmail\ncomposio link googlecalendar --no-browser',
      },
    ],
    notes: ['Retry the original `execute` command after linking succeeds.'],
  },
  {
    id: 'listen',
    title: '`listen` - Subscribe To Trigger Events',
    features: [CLI_EXPERIMENTAL_FEATURES.LISTEN],
    summary:
      'Use `listen` for temporary trigger subscriptions in consumer projects, especially when background agents should consume new event payloads from artifact files.',
    examples: [
      {
        code: "composio listen GMAIL_NEW_GMAIL_MESSAGE\ncomposio listen SLACK_RECEIVE_MESSAGE -p '{ trigger_config: { channel: \"C123\" } }'\ncomposio listen GMAIL_NEW_GMAIL_MESSAGE --stream\ncomposio listen GMAIL_NEW_GMAIL_MESSAGE --stream '.data.threadId'\ncomposio listen GMAIL_NEW_GMAIL_MESSAGE --timeout 5m\ncomposio listen GMAIL_NEW_GMAIL_MESSAGE -p @trigger.json --max-events 5",
      },
    ],
    flags: [
      {
        name: '`-p/--params`',
        description:
          'Provide only trigger config fields; connected account resolution is automatic.',
      },
      {
        name: '`--stream`',
        description: 'Print events inline, optionally narrowed to a JSON path.',
      },
      {
        name: '`--timeout` and `--max-events`',
        description: 'Stop long-running listeners cleanly.',
      },
    ],
    notes: [
      '`composio artifacts cwd` shows the current artifact root when saved payloads need inspection.',
    ],
  },
  {
    id: 'proxy',
    title: '`proxy` - Raw API Access',
    summary:
      'Use `proxy` when a toolkit supports a raw API operation that is easier than finding a dedicated tool slug.',
    examples: [
      {
        code: 'composio proxy https://api.github.com/user --toolkit github --method GET </dev/null',
      },
    ],
  },
  {
    id: 'run',
    title: '`run` - Scripting, LLMs, and Programmatic Workflows',
    summary:
      'For programmatic calls, loops, output plumbing, or anything beyond a single tool call, prefer `composio run`.',
    intro: [
      '`composio run` executes an inline ESM JavaScript/TypeScript snippet with authenticated `execute()`, `search()`, `proxy()`, and the experimental `experimental_subAgent()` helper pre-injected. No SDK setup required.',
    ],
    examples: [
      {
        description: 'Chain multiple tools',
        code: 'composio run \'\n  const me = await execute("GITHUB_GET_THE_AUTHENTICATED_USER");\n  const emails = await execute("GMAIL_FETCH_EMAILS", { max_results: 1 });\n  console.log({ login: me.data.login, fetchedEmails: !!emails.data });\n\'',
      },
      {
        description: 'Fan out with Promise.all',
        code: 'composio run \'\n  const [me, emails] = await Promise.all([\n    execute("GITHUB_GET_THE_AUTHENTICATED_USER"),\n    execute("GMAIL_FETCH_EMAILS", { max_results: 5 }),\n  ]);\n  console.log({ login: me.data.login, emailCount: emails.data.messages?.length });\n\'',
      },
      {
        description: 'Feed tool output into an LLM and get structured JSON back',
        code: 'composio run --logs-off \'\n  const emails = await execute("GMAIL_FETCH_EMAILS", { max_results: 5 });\n  const brief = await experimental_subAgent(\n    `Summarize these emails and count them.\\n\\n${emails.prompt()}`,\n    { schema: z.object({ summary: z.string(), count: z.number() }) }\n  );\n  console.log(brief.structuredOutput);\n\'',
      },
    ],
    notes: [
      'Use top-level `execute --parallel` instead when the user only needs a few independent tool calls and does not need script logic.',
    ],
  },
  {
    id: 'auth',
    title: 'Auth',
    examples: [
      {
        code: 'composio whoami   # check current session\ncomposio login    # authenticate if whoami fails',
      },
    ],
  },
];

const defaultWorkflow = (build: SkillBuildContext) => {
  const lines = [
    '1. Start with `composio execute <slug>` whenever the slug is known.',
    '2. If several independent tool calls must happen at once, use `composio execute -p/--parallel` with repeated `<slug> -d <json>` groups.',
    '3. If `execute` says the toolkit is not connected, run `composio link <toolkit>` and retry.',
    '4. If the arguments are unclear, run `composio execute <slug> --get-schema` or `--dry-run` before guessing.',
    '5. Reach for `composio search "<task>"` only when the slug is unknown. `search` accepts one or more queries, so batch related discovery work into a single command when useful.',
  ];

  if (build.experimentalFeatures[CLI_EXPERIMENTAL_FEATURES.LISTEN]) {
    lines.push(
      '6. If the CLI build enables the experimental `listen` feature, use it for temporary consumer-project trigger subscriptions.'
    );
  }

  return lines;
};

const referenceDocuments = [
  composioDevReference,
  powerUserExamplesReference,
  troubleshootingReference,
] as const;

const renderExample = (example: SkillExample) => {
  const lines = [];

  if (example.description) {
    lines.push(example.description + ':');
  }

  lines.push('```bash', example.code, '```');
  return lines.join('\n');
};

const renderCommand = (build: SkillBuildContext, command: SkillCommand) => {
  const lines: string[] = [`## ${command.title}`];

  if (command.summary) {
    lines.push('', command.summary);
  }

  for (const intro of command.intro ?? []) {
    lines.push('', intro);
  }

  const examples = (command.examples ?? []).filter(example => isEnabledForBuild(build, example));
  if (examples.length > 0) {
    for (const example of examples) {
      lines.push('', renderExample(example));
    }
  }

  const flags = (command.flags ?? []).filter(flag => isEnabledForBuild(build, flag));
  if (flags.length > 0) {
    lines.push('', 'Key flags:');
    for (const flag of flags) {
      lines.push(`- ${flag.name}: ${flag.description}`);
    }
  }

  for (const note of command.notes ?? []) {
    lines.push('', `- ${note}`);
  }

  for (const extra of (command.extraBody ?? []).filter(block => isEnabledForBuild(build, block))) {
    lines.push('', extra.markdown);
  }

  return lines.join('\n');
};

export const renderComposioCliSkill = (channel: SkillReleaseChannel) => {
  const build = resolveSkillBuildContext(channel);
  const lines: string[] = [
    '---',
    `name: ${frontmatter.name}`,
    `description: ${frontmatter.description}`,
    '---',
    '',
    '<!-- AUTO-GENERATED: edit skills-src/composio-cli/index.ts and rebuild -->',
    `<!-- release-channel: ${channel} -->`,
    '',
    '# Composio CLI',
    '',
    '## Default Workflow',
    '',
    ...defaultWorkflow(build),
  ];

  const enabledCommands = commands.filter(command => isEnabledForBuild(build, command));
  for (const command of enabledCommands) {
    lines.push('', renderCommand(build, command));
  }

  lines.push(
    '',
    '## Escalate Only When Needed',
    '',
    'If the user is stuck on top-level commands or needs fallback inspection commands, load [references/troubleshooting.md](references/troubleshooting.md).',
    '',
    'If the user explicitly asks about developer projects, auth configs, connected accounts, triggers, logs, orgs, or projects, load [references/composio-dev.md](references/composio-dev.md). `composio dev` is not the default end-user path.'
  );

  return lines.join('\n') + '\n';
};

export const renderReferenceFiles = (channel: SkillReleaseChannel) => {
  const build = resolveSkillBuildContext(channel);
  return Object.fromEntries(
    referenceDocuments.map(document => [
      `${document.slug}.md`,
      renderReferenceDocument(document, build),
    ])
  );
};

export const validateSkillSources = () => referenceDocuments.flatMap(validateReferenceDocument);

const copyDir = (sourceDir: string, targetDir: string) => {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDir(sourcePath, targetPath);
      continue;
    }

    fs.copyFileSync(sourcePath, targetPath);
  }
};

export const buildComposioCliSkill = ({
  channel,
  outputRoot,
}: {
  channel: SkillReleaseChannel;
  outputRoot: string;
}) => {
  const skillOutputDir = path.join(outputRoot, 'composio-cli');
  fs.rmSync(skillOutputDir, { recursive: true, force: true });
  fs.mkdirSync(skillOutputDir, { recursive: true });

  fs.writeFileSync(path.join(skillOutputDir, 'SKILL.md'), renderComposioCliSkill(channel), 'utf8');

  const agentsSourceDir = path.join(sourceAssetsDir, 'agents');
  if (fs.existsSync(agentsSourceDir)) {
    copyDir(agentsSourceDir, path.join(skillOutputDir, 'agents'));
  }

  const referencesOutputDir = path.join(skillOutputDir, 'references');
  fs.mkdirSync(referencesOutputDir, { recursive: true });
  for (const [fileName, markdown] of Object.entries(renderReferenceFiles(channel))) {
    fs.writeFileSync(path.join(referencesOutputDir, fileName), markdown, 'utf8');
  }

  return skillOutputDir;
};
