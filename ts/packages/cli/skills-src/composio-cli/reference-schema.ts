import { CLI_EXPERIMENTAL_FEATURES, type CliReleaseChannel } from '../../src/experimental-features';

export type SkillReleaseChannel = CliReleaseChannel;

export type SkillFeatureFlag =
  (typeof CLI_EXPERIMENTAL_FEATURES)[keyof typeof CLI_EXPERIMENTAL_FEATURES];

export type SkillBuildContext = {
  channel: SkillReleaseChannel;
  experimentalFeatures: Readonly<Record<SkillFeatureFlag, boolean>>;
};

export type FeatureScoped = {
  features?: SkillFeatureFlag[];
};

export type CommandSnippet = FeatureScoped & {
  code: string;
  description?: string;
};

export type ReferenceSection = FeatureScoped & {
  body?: string[];
  commands?: CommandSnippet[];
  title: string;
};

export type ReferenceDocument = {
  intro?: string[];
  slug: string;
  title: string;
  sections: ReferenceSection[];
};

const TOP_LEVEL_COMMANDS = new Set([
  'artifacts',
  'dev',
  'execute',
  'link',
  'listen',
  'login',
  'logout',
  'proxy',
  'run',
  'search',
  'tools',
  'whoami',
]);

export const resolveSkillBuildContext = (channel: SkillReleaseChannel): SkillBuildContext => ({
  channel,
  experimentalFeatures: {
    [CLI_EXPERIMENTAL_FEATURES.LISTEN]: channel === 'beta',
    [CLI_EXPERIMENTAL_FEATURES.MULTI_ACCOUNT]: channel === 'beta',
  },
});

export const isEnabledForBuild = (build: SkillBuildContext, value?: FeatureScoped) =>
  !value?.features || value.features.every(feature => build.experimentalFeatures[feature]);

export const renderCommandSnippet = (snippet: CommandSnippet) => {
  const lines: string[] = [];

  if (snippet.description) {
    lines.push(snippet.description + ':');
  }

  lines.push('```bash', snippet.code, '```');
  return lines.join('\n');
};

export const renderReferenceDocument = (document: ReferenceDocument, build: SkillBuildContext) => {
  const lines = [`# ${document.title}`];

  for (const introLine of document.intro ?? []) {
    lines.push('', introLine);
  }

  for (const section of document.sections.filter(section => isEnabledForBuild(build, section))) {
    lines.push('', `## ${section.title}`);

    for (const bodyLine of section.body ?? []) {
      lines.push('', bodyLine);
    }

    for (const command of (section.commands ?? []).filter(command =>
      isEnabledForBuild(build, command)
    )) {
      lines.push('', renderCommandSnippet(command));
    }
  }

  return lines.join('\n') + '\n';
};

export const validateCommandSnippet = (snippet: CommandSnippet, documentSlug: string) => {
  const errors: string[] = [];
  const lines = snippet.code.split('\n');
  let inQuotedCommand = false;
  let expectingContinuation = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }

    if (inQuotedCommand) {
      const quoteCount = (line.match(/'/g) ?? []).length;
      if (line === "'" || quoteCount % 2 === 1) {
        inQuotedCommand = false;
      }
      continue;
    }

    if (expectingContinuation) {
      expectingContinuation = line.endsWith('\\');
      continue;
    }

    if (
      line.startsWith('cat ') ||
      line.startsWith('echo ') ||
      line.startsWith('source ') ||
      line.startsWith('export ')
    ) {
      continue;
    }

    if (!line.startsWith('composio ')) {
      errors.push(`[${documentSlug}] command must start with "composio": ${line}`);
      continue;
    }

    const normalized = line.endsWith('\\') ? line.slice(0, -1).trim() : line;
    const parts = normalized.split(/\s+/);
    const topLevel = parts[1];
    if (!TOP_LEVEL_COMMANDS.has(topLevel)) {
      errors.push(`[${documentSlug}] unknown top-level command "${topLevel}" in: ${normalized}`);
    }

    expectingContinuation = line.endsWith('\\');
    const singleQuoteCount = (line.match(/'/g) ?? []).length;
    if (singleQuoteCount % 2 === 1) {
      inQuotedCommand = true;
    }
  }

  return errors;
};

export const validateReferenceDocument = (document: ReferenceDocument) => {
  const errors: string[] = [];

  for (const section of document.sections) {
    for (const command of section.commands ?? []) {
      errors.push(...validateCommandSnippet(command, document.slug));
    }
  }

  return errors;
};
