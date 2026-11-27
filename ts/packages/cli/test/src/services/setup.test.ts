import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { promisify } from 'node:util';
import { temporaryDirectoryTask } from 'tempy';
import { it } from 'vitest';

it.skipIf(process.platform === 'win32')('lets Codex setup subprocesses read stdin to EOF', () =>
  temporaryDirectoryTask(async directory => {
    await writeFile(
      join(directory, 'codex'),
      `#!/bin/sh
cat > /dev/null || exit 1
case "$*" in
  '--version') printf '%s\\n' 'codex-cli 0.144.1' ;;
  'plugin marketplace list --help'|'plugin list --help') printf '%s\\n' '  --json' ;;
  'plugin marketplace list --json') printf '%s\\n' '{"marketplaces":[{"name":"composio","source":"ComposioHQ/composio-plugin-openai"}]}' ;;
  'plugin list --json') printf '%s\\n' '{"installed":[{"pluginId":"composio@composio","installed":true,"enabled":true}]}' ;;
  *) exit 1 ;;
esac
`,
      { mode: 0o755 }
    );

    await promisify(execFile)('bun', ['run', 'src/bin.ts', 'setup', '--target', 'codex', '--yes'], {
      env: {
        ...process.env,
        PATH: [directory, process.env.PATH].join(delimiter),
        CODEX_HOME: directory,
        COMPOSIO_CLI_TELEMETRY_DISABLED: '1',
      },
      timeout: 10_000,
    });
  })
);
