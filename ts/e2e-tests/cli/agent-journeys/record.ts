/**
 * Records one journey with a real model.
 *
 *   ANTHROPIC_API_KEY=… bun run record.ts --set <name> --journey <id> --provider anthropic --model <model>
 *   OPENAI_API_KEY=…    bun run record.ts --set <name> --journey <id> --provider openai    --model <model>
 *
 * aimock sits between the agent loop and the provider, forwards each request,
 * and records the answer. The run is judged by the journey's own checks: a run
 * that reached the goal becomes `fixtures/<journey>.<provider>.<model>.json`;
 * a run that did not leaves the fixtures alone. Either way the transcript is
 * kept in `transcripts/<set>/`, where a set names what was being measured.
 *
 * One command records one journey with one model, once. There are no retries.
 */

import { LLMock, type RecordProviderKey } from '@copilotkit/aimock';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { adapterFor } from './src/adapters';
import { fixturePath, HAND_AUTHORED, type Provider } from './src/fixtures';
import { journeyById, JOURNEYS } from './src/journeys';
import { runJourney } from './src/run-journey';
import { buildSkill } from './src/skill';

const UPSTREAMS: Record<Provider, { url: string; keyVariable: string }> = {
  anthropic: { url: 'https://api.anthropic.com', keyVariable: 'ANTHROPIC_API_KEY' },
  openai: { url: 'https://api.openai.com', keyVariable: 'OPENAI_API_KEY' },
};

const usage = () =>
  [
    'Usage: bun run record.ts --set <name> --journey <id> --provider <anthropic|openai> --model <model>',
    `Journeys: ${JOURNEYS.map(journey => journey.id).join(', ')}`,
  ].join('\n');

const { values } = parseArgs({
  options: {
    journey: { type: 'string' },
    provider: { type: 'string' },
    model: { type: 'string' },
    set: { type: 'string' },
    // For rehearsing the recorder against a local stand-in for the provider.
    upstream: { type: 'string' },
  },
});

const provider = z.enum(['anthropic', 'openai']).safeParse(values.provider);
const set = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/)
  .safeParse(values.set);
if (
  !set.success ||
  !values.journey ||
  !provider.success ||
  !values.model ||
  values.model === HAND_AUTHORED
) {
  console.error(usage());
  process.exit(2);
}
const journey = journeyById(values.journey);
const model = values.model;
const upstream = UPSTREAMS[provider.data];
const apiKey = process.env[upstream.keyVariable];
if (!apiKey && !values.upstream) {
  console.error(`${upstream.keyVariable} is not set; nothing was sent.`);
  process.exit(2);
}

/** What aimock's recorder writes: one file per answered request. */
const RecordedFile = z.object({
  fixtures: z
    .array(
      z.looseObject({
        match: z.looseObject({ turnIndex: z.number().optional() }),
        response: z.looseObject({
          toolCalls: z.array(z.looseObject({ id: z.string().optional() })).optional(),
        }),
      })
    )
    .min(1),
});

const outDirectory = join(import.meta.dir, 'transcripts', set.data);
mkdirSync(outDirectory, { recursive: true });

const git = (...args: string[]): string =>
  execFileSync('git', args, { cwd: import.meta.dir, encoding: 'utf8' }).trim();
const CLI_PACKAGE = ':/ts/packages/cli';
/** What the run measured: the checkout, and the skill text the model was given. */
const provenance = {
  recordedOn: new Date().toISOString().slice(0, 10),
  revision: git('rev-parse', '--short', 'HEAD'),
  // Uncommitted changes to the CLI or the skill mean the revision alone does not name what ran.
  cliPackageModified: git('status', '--porcelain', '--', CLI_PACKAGE) !== '',
  // The system prompt and the reference files the model can open.
  skillSha256: createHash('sha256').update(JSON.stringify(buildSkill())).digest('hex'),
};
const rawDirectory = mkdtempSync(join(tmpdir(), 'composio-agent-journey-recording-'));

const providerKey: RecordProviderKey = provider.data;
const mock = new LLMock({
  port: 0,
  logLevel: 'silent',
  record: {
    providers: { [providerKey]: values.upstream ?? upstream.url },
    // The agent loop only ever sends a placeholder; aimock holds the real key.
    providerKeys: apiKey ? { [providerKey]: apiKey } : {},
    fixturePath: rawDirectory,
  },
});

const baseURL = await mock.start();
let exitCode = 0;
try {
  const run = await runJourney(journey, adapterFor(provider.data, model, baseURL));
  try {
    const checks = journey.checks(run);
    const reachedGoal = checks.every(check => check.ok);

    const recorded = readdirSync(rawDirectory, { recursive: true, encoding: 'utf8' })
      .filter(name => name.endsWith('.json'))
      .flatMap(
        name =>
          RecordedFile.parse(JSON.parse(readFileSync(join(rawDirectory, name), 'utf8'))).fixtures
      )
      .sort((left, right) => (left.match.turnIndex ?? 0) - (right.match.turnIndex ?? 0));

    // The recorder keys a turn on its position only. Each turn after the first
    // is also tied to the call it answers and to that command's exit code, so a
    // CLI that now exits differently leaves the replay without a match.
    let commandsSeen = 0;
    const fixtures = recorded.map((fixture, index) => {
      const previous = index === 0 ? undefined : recorded[index - 1];
      const previousCalls = previous?.response.toolCalls ?? [];
      commandsSeen += previousCalls.length;
      const answered = run.transcript.commands[commandsSeen - 1];
      const lastCallId = previousCalls.at(-1)?.id;
      return previous && lastCallId && answered
        ? {
            ...fixture,
            match: {
              ...fixture.match,
              toolCallId: lastCallId,
              toolResultContains: `"exit_code":${answered.exitCode},`,
            },
          }
        : fixture;
    });

    const fixtureFile = JSON.stringify(
      {
        $comment: `Recorded from ${provider.data} ${model} by record.ts. Do not edit by hand; record again.`,
        fixtures,
      },
      null,
      2
    );
    const transcriptFile = JSON.stringify(
      {
        journey: journey.id,
        provider: provider.data,
        model,
        ...provenance,
        prompt: journey.prompt,
        reachedGoal,
        stop: run.transcript.stop,
        modelTurns: run.transcript.modelTurns,
        checks,
        commands: run.transcript.commands.map(({ command, exitCode: code, stdout, stderr }) => ({
          command,
          exitCode: code,
          stdout,
          stderr,
        })),
        messages: run.transcript.messages,
        replies: run.transcript.replies,
      },
      null,
      2
    );

    // Nothing that could carry a credential is kept, whatever the recorder did.
    const leaks = [fixtureFile, transcriptFile].flatMap(text => [
      ...(apiKey && text.includes(apiKey) ? ['the API key'] : []),
      // A provider key by its prefix, or a credential header recorded as a JSON key.
      ...(/sk-ant-|sk-proj-|"(?:x-api-key|authorization)"\s*:/i.test(text)
        ? ['a credential marker']
        : []),
    ]);
    if (leaks.length > 0) {
      throw new Error(
        `Refusing to write: the recording contains ${[...new Set(leaks)].join(' and ')}.`
      );
    }

    const stem = `${journey.id}.${provider.data}.${model}`;
    const transcriptPath = join(outDirectory, `${stem}.json`);
    writeFileSync(transcriptPath, `${transcriptFile}\n`);

    console.log(`journey   ${journey.id}`);
    console.log(`model     ${provider.data} ${model}`);
    console.log(
      `stop      ${JSON.stringify(run.transcript.stop)} after ${run.transcript.modelTurns} model turn(s)`
    );
    for (const command of run.transcript.commands) {
      console.log(`  [${command.exitCode}] ${command.command}`);
    }
    for (const check of checks) {
      console.log(
        `  ${check.ok ? 'ok  ' : 'FAIL'} ${check.name}${check.ok ? '' : ` (saw ${check.seen ?? 'nothing'})`}`
      );
    }
    console.log(`transcript ${transcriptPath}`);

    if (reachedGoal) {
      const target = fixturePath(journey.id, provider.data, model);
      writeFileSync(target, `${fixtureFile}\n`);
      console.log(`fixture    ${target} (${fixtures.length} turn(s))`);
    } else {
      console.log('fixture    not written: the run did not reach the goal');
      exitCode = 1;
    }
  } finally {
    await run.rig.stop();
  }
} finally {
  await mock.stop();
  rmSync(rawDirectory, { recursive: true, force: true });
}
process.exit(exitCode);
