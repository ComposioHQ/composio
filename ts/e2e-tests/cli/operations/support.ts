/**
 * Helpers shared by the operation suites.
 */

import { join } from 'node:path';
import { sanitizeOutput } from '@e2e-tests/utils';
import type { JournalEntry } from '@e2e-tests/cli-fake-backend';
import type { CliRig, CommandResult } from '@e2e-tests/cli-fake-backend/rig';
import { z } from 'zod';

/** Per-test budget: a command is a few hundred milliseconds, a retried one a few seconds. */
export const TEST_TIMEOUT_MS = 90_000;

/** Budget for starting a rig, which may build the CLI image on a cold machine. */
export const RIG_TIMEOUT_MS = 1_200_000;

export const SLACK_ARGUMENTS = `'{"channel":"general","text":"hello"}'`;
export const EXECUTE_SLACK = `composio execute SLACK_SEND_MESSAGE -d ${SLACK_ARGUMENTS}`;
export const PLAYGROUND_EXECUTE_SLACK = `composio dev playground-execute SLACK_SEND_MESSAGE -d ${SLACK_ARGUMENTS}`;
export const SEARCH_SLACK = 'composio search "send a slack message"';

/** A directory outside the journey's home, initialized by `composio dev init`. */
export const DEV_DIRECTORY = '/work/app';

export const clean = sanitizeOutput;

/**
 * The requests a command made to do its job. The update check and telemetry
 * run beside every command and are asserted on their own.
 */
export const commandRequests = (result: CommandResult): ReadonlyArray<JournalEntry> =>
  result.requests.filter(entry => entry.role === 'backend' || entry.role === 'dashboard');

export const routesOf = (result: CommandResult): string[] =>
  commandRequests(result).map(entry => entry.route ?? `unrouted ${entry.method} ${entry.path}`);

/** Parses stdout as JSON with `schema`; a stdout that is not pure JSON fails the test. */
export const stdoutJson = <T>(result: CommandResult, schema: z.ZodType<T>): T => {
  const raw = clean(result.stdout);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new Error(
      `stdout is not pure JSON (exit ${result.exitCode}).\nstdout: ${raw.slice(0, 400)}\nstderr: ${clean(result.stderr).slice(0, 400)}`,
      { cause }
    );
  }
  return schema.parse(parsed);
};

export const ExecutionResult = z.looseObject({
  successful: z.boolean(),
  error: z.string().nullable().optional(),
  slug: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  retry: z.enum(['safe', 'check-first']).optional(),
});

export const SearchResult = z.looseObject({
  results: z.array(
    z.looseObject({ use_case: z.string(), primary_tool_slugs: z.array(z.string()) })
  ),
  next_steps: z.looseObject({
    steps: z.array(z.looseObject({ action: z.string(), command: z.string() })),
  }),
});

/** The stored login, as `~/.composio/user_data.json` holds it. */
export const StoredLogin = z.looseObject({
  api_key: z.string().nullable(),
  base_url: z.string().nullable(),
  web_url: z.string().nullable(),
  org_id: z.string().nullable(),
  test_user_id: z.string().nullable(),
});

export const readStoredLogin = async (rig: CliRig) =>
  StoredLogin.parse(
    JSON.parse(await rig.journey.readFile(`${rig.journey.home}/.composio/user_data.json`))
  );

/** Initializes `DEV_DIRECTORY` for the org's default developer project. */
export const initDeveloperDirectory = async (rig: CliRig): Promise<void> => {
  const result = await rig.run(
    `mkdir -p ${DEV_DIRECTORY} && cd ${DEV_DIRECTORY} && composio dev init --yes --no-browser`
  );
  if (result.exitCode !== 0) {
    throw new Error(`composio dev init failed: ${clean(result.stderr) || clean(result.stdout)}`);
  }
};

/**
 * Runs `command` with a pseudo-terminal on all three streams, then applies the
 * redirections written into the command itself. `script` allocates the
 * terminal; what the terminal showed lands in the returned `terminal` text.
 */
export const runWithTerminal = async (rig: CliRig, command: string) => {
  const transcript = '/tmp/e2e-terminal.txt';
  const quoted = `'${`stty cols 200; ${command}`.replace(/'/g, `'\\''`)}'`;
  const result = await rig.run(`script -qec ${quoted} ${transcript} > /dev/null`);
  const terminal = clean(await rig.journey.readFile(transcript))
    .split('\n')
    .filter(line => !line.startsWith('Script started on') && !line.startsWith('Script done on'))
    .join('\n');
  return { ...result, terminal };
};

/** Writes the journey's steps next to the suite, as the other CLI suites do. */
export const writeDebugLog = (rig: CliRig, importMetaDir: string, name: string): Promise<void> =>
  rig.journey.writeDebugLog(join(importMetaDir, `DEBUG.${name}.log`));
