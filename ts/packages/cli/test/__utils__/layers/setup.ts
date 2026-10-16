import { Effect, Layer } from 'effect';
import type { CommandRunnerShape } from 'src/services/command-runner';
import {
  SetupSkillInstaller,
  type SetupSkillInstallerShape,
} from 'src/services/setup-skill-installer';
import { CommandRunnerTest } from './command-runner';

/**
 * An installer with no Claude skill that changes nothing: every check and
 * every install or removal answers `false`, however often it runs.
 */
const noOpSetupSkillInstaller = SetupSkillInstaller.of({
  isClaudeSkillReady: Effect.succeed(false),
  hasManagedClaudeSkill: Effect.succeed(false),
  ensureClaudeSkill: Effect.succeed(false),
  removeClaudeSkill: Effect.succeed(false),
});

/**
 * A `SetupSkillInstaller` that answers with `installer`, or the no-op one
 * when the test leaves it out.
 */
export const SetupSkillInstallerTest = (installer?: SetupSkillInstallerShape) =>
  Layer.succeed(SetupSkillInstaller, installer ?? noOpSetupSkillInstaller);

/**
 * The host commands `setup` runs and the Claude skill it installs, for a
 * test that needs nothing else from the full `TestLive` layer.
 */
export const SetupTest = (data?: {
  readonly commandRunner?: CommandRunnerShape;
  readonly setupSkillInstaller?: SetupSkillInstallerShape;
}) =>
  Layer.mergeAll(
    CommandRunnerTest(data?.commandRunner),
    SetupSkillInstallerTest(data?.setupSkillInstaller)
  );
