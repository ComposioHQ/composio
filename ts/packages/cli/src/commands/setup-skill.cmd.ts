import { Argument, Command, Flag } from 'effect/unstable/cli';
import { Option } from 'effect';
import { installSkill } from 'src/effects/install-skill';

export const setupSkillCmd = Command.make(
  'skill',
  {
    target: Argument.Literals('target', ['claude', 'codex', 'openclaw']),
    name: Flag.String('name').pipe(
      Flag.optional,
      Flag.withDescription('Installed skill name (default: composio-cli)')
    ),
  },
  ({ target, name }) => installSkill({ target, skillName: Option.getOrUndefined(name) })
).pipe(
  Command.withDescription('Install the Composio CLI skill for an agent host.'),
  Command.withExamples([
    { command: 'composio setup skill claude' },
    { command: 'composio setup skill codex --name composio-cli' },
  ])
);
