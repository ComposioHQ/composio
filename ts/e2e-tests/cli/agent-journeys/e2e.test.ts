/**
 * Agent journeys, replayed.
 *
 * Each fixture file is one journey as one model played it. aimock serves that
 * file in strict mode, so a request the file does not answer fails the test;
 * the journey's checks then look at what the commands did, because a replay
 * alone passes even when every command failed.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { LLMock } from '@copilotkit/aimock';
import { join } from 'node:path';
import { adapterFor } from './src/adapters';
import { HAND_AUTHORED, listFixtures } from './src/fixtures';
import { JOURNEYS, type JourneyRun } from './src/journeys';
import { runJourney } from './src/run-journey';

const JOURNEY_TIMEOUT_MS = 1_200_000;

// A fixture's `turnIndex` must hold exactly; aimock otherwise treats it as a hint.
process.env.AIMOCK_STRICT_TURN_INDEX = '1';

const fixtures = listFixtures();

for (const journey of JOURNEYS) {
  describe(`journey: ${journey.title}`, () => {
    const played = fixtures.filter(fixture => fixture.journeyId === journey.id);

    if (!played.some(fixture => fixture.provider === 'openai')) {
      it.todo(`openai: no fixture for ${journey.id}`);
    }
    if (!played.some(fixture => fixture.provider === 'anthropic')) {
      // A recording is kept only when the run reached the goal; see the README.
      it.todo(`anthropic: no recorded run of ${journey.id} reached its goal`);
    }

    for (const fixture of played) {
      const origin = fixture.model === HAND_AUTHORED ? 'hand-authored' : 'recorded';

      describe(`${fixture.provider} ${fixture.model} (${origin})`, () => {
        let mock: LLMock;
        let run: JourneyRun;

        beforeAll(async () => {
          mock = new LLMock({ port: 0, strict: true, logLevel: 'silent' });
          mock.loadFixtureFile(fixture.path);
          const baseURL = await mock.start();
          run = await runJourney(journey, adapterFor(fixture.provider, fixture.model, baseURL));
        }, JOURNEY_TIMEOUT_MS);

        afterAll(async () => {
          await run?.rig.journey.writeDebugLog(
            join(import.meta.dir, `DEBUG.${journey.id}.${fixture.provider}.${fixture.model}.log`)
          );
          await run?.rig.stop();
          await mock?.stop();
        });

        it('replays every recorded turn, and nothing else', () => {
          const requests = mock.getRequests();
          expect(requests.map(request => request.response.status)).toEqual(requests.map(() => 200));
          // Each fixture answered exactly one request: none skipped, none reused.
          const served = requests.map(request => request.response.fixture);
          expect(new Set(served).size).toBe(served.length);
          expect(served).toHaveLength(mock.getFixtures().length);
        });

        it('ran at least one command, and every command reached the container', () => {
          expect(run.transcript.commands.length).toBeGreaterThan(0);
          expect(run.rig.journey.steps().map(step => step.command)).toEqual(
            expect.arrayContaining(run.transcript.commands.map(command => command.command))
          );
        });

        it('reached the goal', () => {
          const failed = journey.checks(run).filter(check => !check.ok);
          expect(failed).toEqual([]);
        });

        if (origin === 'hand-authored' && journey.scriptedChecks) {
          const { scriptedChecks } = journey;
          it('the CLI answered each scripted command as described', () => {
            const failed = scriptedChecks(run).filter(check => !check.ok);
            expect(failed).toEqual([]);
          });
        }
      });
    }
  });
}
