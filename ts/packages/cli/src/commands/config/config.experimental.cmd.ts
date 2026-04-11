import * as fs from 'node:fs';
import * as path from 'node:path';
import { Command, Args } from '@effect/cli';
import { Effect, Option } from 'effect';
import { ComposioCliUserConfig } from 'src/services/cli-user-config';
import { TerminalUI } from 'src/services/terminal-ui';
import { NodeOs } from 'src/services/node-os';
import { CLI_EXPERIMENTAL_FEATURES } from 'src/constants';
import { buildComposioCliSkill } from '../../../skills-src/composio-cli/index';
import type { SkillFeatureFlag } from '../../../skills-src/composio-cli/reference-schema';

const knownFeatures: readonly string[] = Object.values(CLI_EXPERIMENTAL_FEATURES);

const featureArg = Args.text({ name: 'feature' }).pipe(
  Args.withDescription(`Experimental feature name. Known features: ${knownFeatures.join(', ')}`),
  Args.optional
);

const stateArg = Args.text({ name: 'state' }).pipe(
  Args.withDescription('Set to "on" or "off"'),
  Args.optional
);

const SKILL_NAME = 'composio-cli';

/**
 * Find every directory where the composio-cli skill is currently installed.
 * Known locations:
 *   ~/.agents/skills/composio-cli   (canonical install target)
 *   ~/.claude/skills/composio-cli   (Claude Code — may be a symlink or a real dir)
 *
 * We resolve symlinks so we don't rebuild the same physical directory twice,
 * but we also rebuild any real (non-symlink) copies so everything stays in sync.
 */
const discoverSkillRoots = (home: string): string[] => {
  const candidates = [path.join(home, '.agents', 'skills'), path.join(home, '.claude', 'skills')];

  const seen = new Set<string>();
  const roots: string[] = [];

  for (const parent of candidates) {
    const skillDir = path.join(parent, SKILL_NAME);
    try {
      const stat = fs.lstatSync(skillDir);
      if (stat.isSymbolicLink()) {
        // Resolve the symlink target — we'll rebuild the real directory it points to
        const realDir = fs.realpathSync(skillDir);
        const realParent = path.dirname(realDir);
        if (!seen.has(realParent)) {
          seen.add(realParent);
          roots.push(realParent);
        }
      } else if (stat.isDirectory()) {
        if (!seen.has(parent)) {
          seen.add(parent);
          roots.push(parent);
        }
      }
    } catch {
      // Directory doesn't exist — skip
    }
  }

  // Always include ~/.agents/skills as a fallback so there's at least one target
  const agentSkillsRoot = path.join(home, '.agents', 'skills');
  if (!seen.has(agentSkillsRoot)) {
    roots.push(agentSkillsRoot);
  }

  return roots;
};

const rebuildSkill = Effect.gen(function* () {
  const ui = yield* TerminalUI;
  const os = yield* NodeOs;
  const cliConfig = yield* ComposioCliUserConfig;
  const home = os.homedir;

  // Build the feature overrides from the current config
  const featureOverrides: Partial<Record<SkillFeatureFlag, boolean>> = {};
  for (const name of knownFeatures) {
    featureOverrides[name as SkillFeatureFlag] = cliConfig.isExperimentalFeatureEnabled(name);
  }

  const roots = discoverSkillRoots(home);
  for (const root of roots) {
    buildComposioCliSkill({
      channel: cliConfig.channel,
      outputRoot: root,
      featureOverrides,
    });
  }

  yield* ui.log.step(
    roots.length === 1
      ? `Rebuilt skill in ${roots[0]}`
      : `Rebuilt skill in ${roots.length} locations`
  );
});

export const configExperimentalCmd = Command.make(
  'experimental',
  { feature: featureArg, state: stateArg },
  ({ feature, state }) =>
    Effect.gen(function* () {
      const ui = yield* TerminalUI;
      const cliConfig = yield* ComposioCliUserConfig;

      // No args: list all experimental features and their state
      if (Option.isNone(feature)) {
        const features = cliConfig.data.experimentalFeatures;
        const lines: string[] = [];
        for (const name of knownFeatures) {
          const enabled = cliConfig.isExperimentalFeatureEnabled(name);
          const configured = name in features;
          const suffix = configured ? '' : ` (default, channel: ${cliConfig.channel})`;
          lines.push(`  ${name}: ${enabled ? 'on' : 'off'}${suffix}`);
        }

        // Show any custom features not in the known list
        for (const [name, value] of Object.entries(features)) {
          if (!knownFeatures.includes(name)) {
            lines.push(`  ${name}: ${value ? 'on' : 'off'}`);
          }
        }

        if (lines.length === 0) {
          yield* ui.log.info('No experimental features available.');
        } else {
          yield* ui.note(lines.join('\n'), 'Experimental Features');
          yield* ui.output(JSON.stringify(features));
        }
        return;
      }

      const featureName = feature.value;

      // Feature name only: show current state
      if (Option.isNone(state)) {
        const enabled = cliConfig.isExperimentalFeatureEnabled(featureName);
        yield* ui.log.info(`${featureName}: ${enabled ? 'on' : 'off'}`);
        yield* ui.output(enabled ? 'on' : 'off');
        return;
      }

      const stateValue = state.value.toLowerCase();
      if (stateValue !== 'on' && stateValue !== 'off') {
        yield* ui.log.error(`Invalid state "${state.value}". Use "on" or "off".`);
        return yield* Effect.fail(new Error(`Invalid state: ${state.value}`));
      }

      const enabled = stateValue === 'on';
      yield* cliConfig.update({
        experimentalFeatures: {
          ...cliConfig.data.experimentalFeatures,
          [featureName]: enabled,
        },
      });

      yield* ui.log.success(`${featureName}: ${stateValue}`);

      // Rebuild the skill so Claude Code picks up the new feature flags
      yield* rebuildSkill.pipe(
        Effect.catchAll(error =>
          Effect.gen(function* () {
            yield* Effect.logDebug('Skill rebuild failed:', error);
            yield* ui.log.warn('Could not rebuild skill (non-fatal)');
          })
        )
      );

      yield* ui.output(stateValue);
    })
).pipe(
  Command.withDescription(
    [
      'View or toggle experimental feature flags.',
      '',
      'Usage:',
      '  composio config experimental                    List all features',
      '  composio config experimental <feature>          Show current state',
      '  composio config experimental <feature> on|off   Enable or disable',
      '',
      `Known features: ${knownFeatures.join(', ')}`,
    ].join('\n')
  )
);
