import * as path from 'node:path';
import { FileSystem } from '@effect/platform';
import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { afterEach, vi } from 'vitest';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { detectOnboardingTargets, parseTargetList } from 'src/onboarding/targets';
import { NodeOs } from 'src/services/node-os';

const setTtyState = (state: { stdin: boolean; stdout: boolean; stderr: boolean }) => {
  const descriptors = {
    stdin: Object.getOwnPropertyDescriptor(process.stdin, 'isTTY'),
    stdout: Object.getOwnPropertyDescriptor(process.stdout, 'isTTY'),
    stderr: Object.getOwnPropertyDescriptor(process.stderr, 'isTTY'),
  };
  Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: state.stdin });
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: state.stdout });
  Object.defineProperty(process.stderr, 'isTTY', { configurable: true, value: state.stderr });
  return () => {
    if (descriptors.stdin) Object.defineProperty(process.stdin, 'isTTY', descriptors.stdin);
    else delete (process.stdin as { isTTY?: boolean }).isTTY;
    if (descriptors.stdout) Object.defineProperty(process.stdout, 'isTTY', descriptors.stdout);
    else delete (process.stdout as { isTTY?: boolean }).isTTY;
    if (descriptors.stderr) Object.defineProperty(process.stderr, 'isTTY', descriptors.stderr);
    else delete (process.stderr as { isTTY?: boolean }).isTTY;
  };
};

describe('CLI: composio onboard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  layer(TestLive())(it => {
    it.scoped('[When] detecting targets [Then] returns all detected supported agents', () =>
      Effect.gen(function* () {
        const os = yield* NodeOs;
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(path.join(os.homedir, '.claude'), { recursive: true });
        yield* fs.makeDirectory(path.join(os.homedir, '.codex'), { recursive: true });
        yield* fs.makeDirectory(path.join(os.homedir, '.cursor'), { recursive: true });
        yield* fs.makeDirectory(path.join(os.homedir, '.dust'), { recursive: true });
        yield* fs.makeDirectory(path.join(os.homedir, '.openclaw'), { recursive: true });

        const detected = yield* detectOnboardingTargets;
        expect(detected.map(target => target.id)).toEqual([
          'claude',
          'codex',
          'cursor',
          'dust',
          'openclaw',
        ]);
      })
    );
  });

  layer(TestLive())(it => {
    it.scoped('[When] targets are filtered [Then] only detected requested targets remain', () =>
      Effect.gen(function* () {
        const os = yield* NodeOs;
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(path.join(os.homedir, '.claude'), { recursive: true });
        yield* fs.makeDirectory(path.join(os.homedir, '.cursor'), { recursive: true });

        const detected = yield* detectOnboardingTargets;
        expect(parseTargetList('cursor,codex', detected).map(target => target.id)).toEqual([
          'cursor',
        ]);
      })
    );
  });

  layer(TestLive())(it => {
    it.scoped(
      '[When] non-interactive and skill install is skipped [Then] prints login handoff',
      () =>
        Effect.gen(function* () {
          const restoreTty = setTtyState({ stdin: false, stdout: true, stderr: true });
          try {
            yield* cli(['onboard', '--yes', '--no-skill-install']);
          } finally {
            restoreTty();
          }

          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
          expect(output).toContain('-- composio onboard --');
          expect(output).toContain('Logging you in..');
          expect(output).toContain('Open this URL in your browser to log in:');
          expect(output).toContain(
            'https://dashboard.composio.dev/?cliKey=te00st11-d0c4-4efa-8117-c638886063e0'
          );
          expect(output).toContain(
            'Email connection and scan consent are completed in the browser onboarding.'
          );
        })
    );
  });
});
