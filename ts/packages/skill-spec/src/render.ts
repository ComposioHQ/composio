import { isEnabledForBuild, type BuildContext } from './build-context';
import type { SkillCommand, SkillExample } from './sections';
import type { ReferenceCommandSnippet, SkillReference } from './references';

export const renderExample = (example: SkillExample): string => {
  const lines: string[] = [];
  if (example.description) {
    lines.push(`${example.description}:`);
  }
  lines.push('```bash', example.code, '```');
  return lines.join('\n');
};

export const renderSnippet = (snippet: ReferenceCommandSnippet): string => {
  const lines: string[] = [];
  if (snippet.description) {
    lines.push(`${snippet.description}:`);
  }
  lines.push('```bash', snippet.code, '```');
  return lines.join('\n');
};

export const renderCommand = (ctx: BuildContext, command: SkillCommand): string => {
  const lines: string[] = [`## ${command.title}`];

  if (command.summary) {
    lines.push('', command.summary);
  }

  for (const intro of command.intro ?? []) {
    lines.push('', intro);
  }

  const examples = (command.examples ?? []).filter(example => isEnabledForBuild(ctx, example));
  for (const example of examples) {
    lines.push('', renderExample(example));
  }

  const flags = (command.flags ?? []).filter(flag => isEnabledForBuild(ctx, flag));
  if (flags.length > 0) {
    lines.push('', 'Key flags:');
    for (const flag of flags) {
      lines.push(`- ${flag.name}: ${flag.description}`);
    }
  }

  for (const note of command.notes ?? []) {
    lines.push('', `- ${note}`);
  }

  for (const extra of (command.extraBody ?? []).filter(block => isEnabledForBuild(ctx, block))) {
    lines.push('', extra.markdown);
  }

  return lines.join('\n');
};

export const renderReference = (ctx: BuildContext, reference: SkillReference): string => {
  const lines: string[] = [`# ${reference.title}`];

  for (const introLine of reference.intro ?? []) {
    lines.push('', introLine);
  }

  for (const section of reference.sections.filter(section => isEnabledForBuild(ctx, section))) {
    lines.push('', `## ${section.title}`);

    for (const bodyLine of section.body ?? []) {
      lines.push('', bodyLine);
    }

    const commands = (section.commands ?? []).filter(command => isEnabledForBuild(ctx, command));
    for (const command of commands) {
      lines.push('', renderSnippet(command));
    }
  }

  return lines.join('\n') + '\n';
};
