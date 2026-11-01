import { Effect } from 'effect';
import { TerminalUI } from 'src/services/terminal-ui';

export const PROJECTS_SWITCH_UNSUPPORTED_MESSAGE =
  'Global developer project switching is no longer supported. Run `composio dev init` in a directory to bind it to a developer project.';

/**
 * Points the user at `composio dev init`: developer projects are bound per directory, so there
 * is no global project to switch and nothing is written.
 */
export const runProjectsSwitch = () =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    yield* ui.log.info(PROJECTS_SWITCH_UNSUPPORTED_MESSAGE);
  });
