import { Command, FileSystem, Path } from '@effect/platform';
import { BunContext } from '@effect/platform-bun';
import { describe, expect, layer } from '@effect/vitest';
import { Effect, Stream } from 'effect';
import cliPackageJson from '../../../package.json' with { type: 'json' };
import {
  buildCliReleaseVersionDefineArgs,
  extractCliReleaseVersion,
} from 'src/utils/cli-release-version';

const FAKE_GH = `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "release" && "\${2:-}" == "list" ]]; then
  shift 2
  jqexpr=""
  exclude_drafts=false
  limit=""
  while [[ \$# -gt 0 ]]; do
    if [[ "\$1" == "--exclude-drafts" ]]; then exclude_drafts=true; shift; continue; fi
    if [[ "\$1" == "--limit" ]]; then limit="\$2"; shift 2; continue; fi
    if [[ "\$1" == "--jq" ]]; then jqexpr="\$2"; shift 2; continue; fi
    shift
  done
  if [[ "\$exclude_drafts" != "true" ]]; then
    echo "release list must pass --exclude-drafts" >&2
    exit 1
  fi
  if [[ "\$limit" != "1000" ]]; then
    echo "release list must pass --limit 1000" >&2
    exit 1
  fi
  jq -r '[.[] | select(.isDraft != true)] | '"\$jqexpr" "\$GH_RELEASES_FIXTURE"
  exit 0
fi
echo "unexpected gh invocation: \$*" >&2
exit 1
`;

const FAKE_CURL = `#!/usr/bin/env bash
set -euo pipefail
cat "\$CURL_FIXTURE"
`;

type ResolverInput = {
  readonly env: Readonly<Record<string, string>>;
  readonly releasesFixture?: ReadonlyArray<{
    readonly tagName: string;
    readonly isPrerelease: boolean;
    readonly isDraft?: boolean;
  }>;
};

const parseOutputs = (output: string): Readonly<Record<string, string>> =>
  Object.fromEntries(
    output
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1)];
      })
  );

const collectText = (stream: Stream.Stream<Uint8Array, unknown>) =>
  stream.pipe(
    Stream.decodeText('utf-8'),
    Stream.runFold('', (output, chunk) => output + chunk)
  );

const runResolver = ({ env, releasesFixture }: ResolverInput) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const fixtureDir = yield* fs.makeTempDirectoryScoped({
      prefix: 'composio-cli-release-resolver-',
    });
    const fakeBin = path.join(fixtureDir, 'bin');
    const workdir = path.join(fixtureDir, 'work');
    yield* fs.makeDirectory(fakeBin, { recursive: true });
    yield* fs.makeDirectory(workdir, { recursive: true });

    for (const [name, body] of [
      ['gh', FAKE_GH],
      ['curl', FAKE_CURL],
    ] as const) {
      const executable = path.join(fakeBin, name);
      yield* fs.writeFileString(executable, body);
      yield* fs.chmod(executable, 0o755);
    }

    const outputPath = path.join(workdir, 'github_output');
    yield* fs.writeFileString(outputPath, '');

    const fixtureEnvironment: Record<string, string> = {};
    if (releasesFixture !== undefined) {
      const fixturePath = path.join(workdir, 'releases.json');
      yield* fs.writeFileString(fixturePath, JSON.stringify(releasesFixture));
      fixtureEnvironment.GH_RELEASES_FIXTURE = fixturePath;
    }

    const repositoryRoot = yield* path.fromFileUrl(new URL('../../../../../../', import.meta.url));
    const resolverPath = path.join(
      repositoryRoot,
      '.github',
      'scripts',
      'cli-release',
      'resolve-release-target.sh'
    );
    const child = yield* Command.make('bash', resolverPath).pipe(
      Command.workingDirectory(repositoryRoot),
      Command.env({
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        GITHUB_OUTPUT: outputPath,
        ...fixtureEnvironment,
        ...env,
      }),
      Command.start
    );
    const result = yield* Effect.all(
      {
        exitCode: child.exitCode,
        stdout: collectText(child.stdout),
        stderr: collectText(child.stderr),
      },
      { concurrency: 'unbounded' }
    );
    const output = yield* fs.readFileString(outputPath);

    return {
      ...result,
      exitCode: Number(result.exitCode),
      output,
      outputs: parseOutputs(output),
    };
  });

describe('CLI release version authority', () => {
  layer(BunContext.layer)(it => {
    it('extracts and defines the exact GitHub release version', () => {
      expect(extractCliReleaseVersion('@composio/cli@0.2.33-beta.322')).toBe('0.2.33-beta.322');
      expect(extractCliReleaseVersion('@composio/core@0.2.33')).toBeUndefined();
      expect(buildCliReleaseVersionDefineArgs('@composio/cli@0.2.33-beta.322')).toEqual([
        '--define',
        '__COMPOSIO_CLI_RELEASE_VERSION__="0.2.33-beta.322"',
      ]);
    });

    it.effect('embeds the release tag and verifies it only on a native build target', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const repositoryRoot = yield* path.fromFileUrl(
          new URL('../../../../../../', import.meta.url)
        );
        const workflow = yield* fs.readFileString(
          path.join(repositoryRoot, '.github', 'workflows', 'build-cli-binaries.yml')
        );
        const buildAllBinariesScript = yield* fs.readFileString(
          path.join(repositoryRoot, 'ts', 'packages', 'cli', 'scripts', 'build-all-binaries.ts')
        );
        const verifyVersionStep = workflow.match(
          /- name: Verify binary version([\s\S]*?)- name: Test binary/
        )?.[1];

        expect(cliPackageJson.version).toBe('0.0.0-development');
        expect(workflow).toContain('RELEASE_TAG: ${{ needs.prepare.outputs.release_tag }}');
        expect(buildAllBinariesScript).toContain(
          '...buildCliReleaseVersionDefineArgs(process.env.RELEASE_TAG)'
        );
        expect(verifyVersionStep).toContain("if: matrix.target == 'bun-linux-x64'");
        expect(verifyVersionStep).toContain('expected_version#@composio/cli@');
      })
    );

    it.scoped('resolves pushes to next as rolling betas', () =>
      Effect.gen(function* () {
        const result = yield* runResolver({
          env: {
            EVENT_NAME: 'push',
            REPOSITORY: 'ComposioHQ/composio',
            RUN_NUMBER: '43',
            COMMIT_SHA: 'deadbeef',
          },
          releasesFixture: [{ tagName: '@composio/cli@0.2.33', isPrerelease: false }],
        });

        expect(result.exitCode, result.stderr).toBe(0);
        expect(result.outputs.release_tag).toBe('@composio/cli@0.2.34-beta.43');
        expect(result.outputs.prerelease).toBe('true');
      })
    );

    it.scoped('accepts an intentional newer base for a manual beta', () =>
      Effect.gen(function* () {
        const result = yield* runResolver({
          env: {
            EVENT_NAME: 'workflow_dispatch',
            ACTION_INPUT: 'build-beta',
            VERSION_INPUT: '0.3.0',
            REPOSITORY: 'ComposioHQ/composio',
            RUN_NUMBER: '44',
            COMMIT_SHA: 'deadbeef',
          },
          releasesFixture: [{ tagName: '@composio/cli@0.2.33', isPrerelease: false }],
        });

        expect(result.exitCode, result.stderr).toBe(0);
        expect(result.outputs.release_tag).toBe('@composio/cli@0.3.0-beta.44');
      })
    );

    it.scoped('rejects a manual beta base at or below the latest stable', () =>
      Effect.gen(function* () {
        const result = yield* runResolver({
          env: {
            EVENT_NAME: 'workflow_dispatch',
            ACTION_INPUT: 'build-beta',
            VERSION_INPUT: '0.2.33',
            REPOSITORY: 'ComposioHQ/composio',
            RUN_NUMBER: '45',
            COMMIT_SHA: 'deadbeef',
          },
          releasesFixture: [{ tagName: '@composio/cli@0.2.33', isPrerelease: false }],
        });

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain('must be newer than latest stable');
      })
    );

    it.scoped('rejects a non-semver manual beta base', () =>
      Effect.gen(function* () {
        const result = yield* runResolver({
          env: {
            EVENT_NAME: 'workflow_dispatch',
            ACTION_INPUT: 'build-beta',
            VERSION_INPUT: 'next',
            REPOSITORY: 'ComposioHQ/composio',
            RUN_NUMBER: '46',
            COMMIT_SHA: 'deadbeef',
          },
        });

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain('Beta version must match');
      })
    );
  });
});
