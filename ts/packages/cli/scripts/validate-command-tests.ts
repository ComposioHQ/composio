// Guards the CLI's command test layout: every command module under
// src/commands/ must have a test at its mirrored path under test/src/commands/
// (drop `commands/` segments, swap `.cmd.ts` for `.cmd.test.ts`), and every
// `*.cmd.test.ts` must resolve to a command. Group entries (`<dir>.cmd.ts`,
// `root-<dir>.cmd.ts`) are covered by root-help-consistency.test.ts.
// COMMAND_TEST_EXEMPTIONS in command-tests.ts lists untested commands; it only
// shrinks, since an exemption whose test now exists fails as stale.
//
// Usage:
//   tsx ./scripts/validate-command-tests.ts
import * as path from 'node:path';

import {
  checkCommandTests,
  collectCommandTests,
  COMMAND_TEST_EXEMPTIONS,
  isGroupEntry,
} from './command-tests';

const scriptDir = import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname);
const packageRoot = path.resolve(scriptDir, '..');

const { commands, tests } = collectCommandTests(packageRoot);
const errors = checkCommandTests({ commands, tests, exemptions: COMMAND_TEST_EXEMPTIONS });

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}

const checked = commands.filter(command => !isGroupEntry(command, commands)).length;
console.log(
  `command tests OK: ${checked} commands checked against ${tests.length} test files, ${COMMAND_TEST_EXEMPTIONS.length} exemptions remaining.`
);
