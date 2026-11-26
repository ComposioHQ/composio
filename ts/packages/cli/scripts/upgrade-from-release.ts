#!/usr/bin/env bun

/**
 * Check that a published CLI release can upgrade itself to a candidate archive.
 *
 * Usage: `bun scripts/upgrade-from-release.ts --archive dist/binaries/<artifact>.zip [--from <tag>] [--to <tag>]`
 *
 * Installs the `--from` release (default: the latest stable one) for the
 * archive's platform into a scratch directory, serves the candidate archive
 * from a local stand-in for GitHub's release API, runs the released binary's
 * `composio upgrade`, and checks that the upgraded install reports the
 * candidate's version and runs a script. `--to` names the candidate's release
 * tag (default `$RELEASE_TAG`), which must be the tag baked into the archive.
 *
 * This is the check for changes to what release archives contain: released
 * clients validate an upgrade archive before they replace themselves.
 */

import * as BunHttpServer from '@effect/platform-bun/BunHttpServer';
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Config, Console, Effect, FileSystem, Layer, Option, Path, Schema, Stream } from 'effect';
import { CliError, Command, Flag } from 'effect/cli';
import { Digest } from 'effect/crypto';
import {
  FetchHttpClient,
  HttpClient,
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/http';
import { ChildProcess } from 'effect/process';
import { optionalString } from '../src/config/env';
import type { GitHubRelease } from '../src/effects/resolve-cli-release';
import { CLI_RELEASE_TAG_PREFIX } from '../src/utils/cli-release-version';
import {
  fetchReleaseByTag,
  findLatestStableCliRelease,
  ReleaseSourceConfig,
} from './_github-releases';
import { archiveExecutableName } from './_release-artifacts';

class UpgradeCheckError extends Schema.TaggedError<UpgradeCheckError>()(
  'scripts/UpgradeCheckError',
  { message: Schema.String }
) {
  override get [CliError.userMessage]() {
    return this.message;
  }
}

const fail = (message: string) => Effect.fail(new UpgradeCheckError({ message }));

/** The hash `checksums.txt` (`<sha256>  <file>` lines) lists for `fileName`. */
const checksumFor = (checksums: string, fileName: string): string | undefined =>
  checksums
    .split('\n')
    .map(line => line.trim().split(/\s+/))
    .find(([, name]) => name === fileName)?.[0];

const sha256 = (bytes: Uint8Array) =>
  Effect.gen(function* () {
    const digest = yield* Digest.Digest;
    return yield* digest.digestHex(Digest.sha256, bytes);
  });

/** Runs a command to completion and collects what it printed. */
const exec = (command: string, args: ReadonlyArray<string>, env?: Record<string, string>) =>
  Effect.scoped(
    Effect.gen(function* () {
      const child = yield* ChildProcess.make(
        command,
        args,
        env === undefined ? {} : { env, extendEnv: false }
      );
      return yield* Effect.all(
        {
          stdout: Stream.mkString(Stream.decodeText(child.stdout)),
          stderr: Stream.mkString(Stream.decodeText(child.stderr)),
          exitCode: child.exitCode,
        },
        { concurrency: 'unbounded' }
      );
    })
  );

/** Like `exec`, failing unless the command exits 0. */
const execOk = (command: string, args: ReadonlyArray<string>) =>
  Effect.flatMap(exec(command, args), result =>
    result.exitCode === 0
      ? Effect.succeed(result)
      : fail(`${command} exited ${result.exitCode}: ${result.stderr.trim()}`)
  );

const download = (url: string) =>
  Effect.gen(function* () {
    const client = HttpClient.filterStatusOk(yield* HttpClient.HttpClient);
    const response = yield* client.get(url);
    return new Uint8Array(yield* response.arrayBuffer);
  }).pipe(Effect.mapError(cause => new UpgradeCheckError({ message: `${url}: ${cause.message}` })));

/**
 * A stand-in for the GitHub release API that serves only the candidate release,
 * at the address of the `HttpServer` it runs on.
 */
const serveCandidate = (options: {
  readonly releasesPath: string;
  readonly tag: string;
  readonly artifact: string;
  readonly candidate: Uint8Array;
  readonly checksums: string;
}) =>
  Effect.gen(function* () {
    const base = HttpServer.formatAddress((yield* HttpServer.HttpServer).address);
    const { releasesPath, tag, artifact, candidate, checksums } = options;
    const release = {
      tag_name: tag,
      name: tag,
      prerelease: tag.includes('-'),
      draft: false,
      assets: [
        {
          name: `${artifact}.zip`,
          browser_download_url: `${base}/assets/${artifact}.zip`,
          size: candidate.byteLength,
        },
        {
          name: 'checksums.txt',
          browser_download_url: `${base}/assets/checksums.txt`,
          size: checksums.length,
        },
      ],
    };
    const notFound = HttpServerResponse.text('Not Found', { status: 404 });
    yield* HttpServer.serveEffect()(
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const { pathname } = new URL(request.url, base);
        if (pathname === releasesPath) return HttpServerResponse.jsonUnsafe([release]);
        if (pathname.startsWith(`${releasesPath}/tags/`)) {
          const requested = decodeURIComponent(pathname.slice(`${releasesPath}/tags/`.length));
          return requested === tag ? HttpServerResponse.jsonUnsafe(release) : notFound;
        }
        if (pathname === `/assets/${artifact}.zip`) return HttpServerResponse.uint8Array(candidate);
        if (pathname === '/assets/checksums.txt') return HttpServerResponse.text(checksums);
        yield* Console.error(`stand-in GitHub API: no route for ${request.method} ${pathname}`);
        return notFound;
      })
    );
    return base;
  });

/** Downloads `release`'s `artifact` archive, verifies it against its `checksums.txt`, and unpacks it into `installDir`. */
const installRelease = (
  release: GitHubRelease,
  artifact: string,
  workDir: string,
  installDir: string
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const assetUrl = (name: string) =>
      Option.fromNullishOr(release.assets.find(asset => asset.name === name)).pipe(
        Option.match({
          onNone: () => fail(`${release.tag_name} has no ${name}`),
          onSome: asset => Effect.succeed(asset.browser_download_url),
        })
      );

    const zipBytes = yield* download(yield* assetUrl(`${artifact}.zip`));
    const checksums = new TextDecoder().decode(yield* download(yield* assetUrl('checksums.txt')));
    if (checksumFor(checksums, `${artifact}.zip`) !== (yield* sha256(zipBytes))) {
      return yield* fail(`${release.tag_name} ${artifact}.zip does not match its checksums.txt`);
    }
    const zipPath = path.join(workDir, `from-${artifact}.zip`);
    const unpacked = path.join(workDir, 'from');
    yield* fs.writeFile(zipPath, zipBytes);
    // `unzip` keeps the executable bit, which the archive's binary needs.
    yield* execOk('unzip', ['-q', zipPath, '-d', unpacked]);
    yield* fs.copy(path.join(unpacked, artifact), installDir);
  });

const upgradeFromRelease = (options: {
  readonly archive: string;
  readonly from: Option.Option<string>;
  readonly to: string;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const source = yield* ReleaseSourceConfig;
    const archivePath = path.resolve(options.archive);
    const artifact = path.basename(archivePath, '.zip');
    const toVersion = options.to.slice(CLI_RELEASE_TAG_PREFIX.length);

    const candidate = yield* fs.readFile(archivePath);
    const apiBaseUrl = yield* serveCandidate({
      releasesPath: `/repos/${source.owner}/${source.repo}/releases`,
      tag: options.to,
      artifact,
      candidate,
      checksums: `${yield* sha256(candidate)}  ${artifact}.zip\n`,
    });

    const workDir = yield* fs.makeTempDirectoryScoped({ prefix: 'composio-upgrade-' });
    const installDir = path.join(workDir, 'install');
    const homeDir = path.join(workDir, 'home');
    yield* fs.makeDirectory(homeDir, { recursive: true });
    // The released binary gets only what it needs: no tokens from this process.
    const passThrough = yield* Config.all({
      PATH: optionalString('PATH'),
      TMPDIR: optionalString('TMPDIR'),
    });
    const env = {
      PATH: passThrough.PATH ?? '',
      ...(passThrough.TMPDIR === undefined ? {} : { TMPDIR: passThrough.TMPDIR }),
      HOME: homeDir,
      USERPROFILE: homeDir,
      COMPOSIO_CACHE_DIR: path.join(homeDir, '.composio'),
      COMPOSIO_DISABLE_TELEMETRY: 'true',
      COMPOSIO_GITHUB_API_BASE_URL: apiBaseUrl,
      COMPOSIO_GITHUB_OWNER: source.owner,
      COMPOSIO_GITHUB_REPO: source.repo,
    };

    const fromRelease = yield* Option.match(options.from, {
      onNone: () =>
        findLatestStableCliRelease.pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => fail('no stable CLI release found'),
              onSome: Effect.succeed,
            })
          )
        ),
      onSome: fetchReleaseByTag,
    });

    yield* Console.error(`Installing ${fromRelease.tag_name} (${artifact})...`);
    yield* installRelease(fromRelease, artifact, workDir, installDir);
    const binary = path.join(installDir, archiveExecutableName(artifact));

    yield* Console.error(`Upgrading ${fromRelease.tag_name} to ${options.to}...`);
    const upgrade = yield* exec(binary, ['upgrade', toVersion], env);
    const upgradeOutput = (upgrade.stdout + upgrade.stderr).trim();
    if (upgradeOutput !== '') yield* Console.error(upgradeOutput);
    if (upgrade.exitCode !== 0) return yield* fail(`composio upgrade exited ${upgrade.exitCode}`);

    const version = (yield* exec(binary, ['--version'], env)).stdout.trim();
    if (version !== toVersion) {
      return yield* fail(`upgraded binary reports ${version}, expected ${toVersion}`);
    }

    const run = yield* exec(binary, ['run', '40 + 2'], env);
    if (run.exitCode !== 0 || !run.stdout.includes('42')) {
      return yield* fail(
        `composio run failed after the upgrade (exit ${run.exitCode}): ${run.stderr}`
      );
    }
    yield* Console.error(
      `${fromRelease.tag_name} upgraded to ${options.to}; --version and run pass.`
    );
  }).pipe(Effect.scoped, Effect.provide(BunHttpServer.layer({ hostname: '127.0.0.1', port: 0 })));

const command = Command.make(
  'upgrade-from-release',
  {
    archive: Flag.File('archive', { mustExist: true }).pipe(
      Flag.withDescription('The candidate release archive, a .zip from dist/binaries.')
    ),
    from: Flag.String('from').pipe(
      Flag.withDescription('The release tag to upgrade from. Default: the latest stable release.'),
      Flag.optional
    ),
    to: Flag.String('to').pipe(
      Flag.withDescription("The candidate's release tag, the one baked into the archive."),
      Flag.withFallbackConfig(Config.String('RELEASE_TAG'))
    ),
  },
  upgradeFromRelease
).pipe(
  Command.withDescription(
    'Check that a published CLI release can upgrade itself to a candidate archive.'
  )
);

if (import.meta.main) {
  Command.run(command, { version: '0.0.0' }).pipe(
    Effect.provide(Layer.mergeAll(BunServices.layer, FetchHttpClient.layer, Digest.layerWebCrypto)),
    BunRuntime.runMain
  );
}
