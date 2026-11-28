#!/usr/bin/env bun

/**
 * Report what the CLI weighs, per release target, next to the Bun runtime floor
 * and the latest stable release.
 *
 * Usage: `bun scripts/size-report.ts [--target <bunTarget>]... [--all] [--release <tag> | --no-release] [--json]`
 *
 * Without `--target` or `--all` it reports the host's target. For each target it
 * compiles, with the release flags (`executableBuildArgs` in `_shared.ts`):
 *
 * - the floor: a one-line program, which is what the Bun runtime alone weighs
 * - the CLI executable
 *
 * and reports the executable, its companion modules, the installed footprint
 * (both together), the release zip and a `.tar.xz` of the same files, and the
 * zip of a published release. "CLI code" is the executable minus the floor: the
 * only part a change to the CLI's code or dependencies can shrink. Measure a
 * change on both its base and its branch with this script before crediting it
 * with a size difference.
 */

import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { $ } from 'bun';
import {
  Config,
  ConfigProvider,
  Console,
  Effect,
  Logger,
  Layer,
  Match,
  Option,
  References,
} from 'effect';
import { FetchHttpClient } from 'effect/http';
import * as BunServices from '@effect/platform-bun/BunServices';
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import { fetchReleaseByTag, findLatestStableCliRelease } from './_github-releases';
import {
  archiveExecutableName,
  compiledBinaryFileName,
  RELEASE_TARGETS,
  type ReleaseTarget,
} from './_release-artifacts';
import { buildCompanionModules, compileExecutable, teardown } from './_shared';

const HOST_TARGETS: Record<string, ReleaseTarget['bunTarget']> = {
  'darwin-arm64': 'bun-darwin-arm64',
  'darwin-x64': 'bun-darwin-x64',
  'linux-x64': 'bun-linux-x64',
  'linux-arm64': 'bun-linux-arm64',
  'win32-x64': 'bun-windows-x64',
};

type Options = {
  readonly targets: ReadonlyArray<ReleaseTarget>;
  readonly release:
    | { readonly kind: 'latest' }
    | { readonly kind: 'tag'; readonly tag: string }
    | { readonly kind: 'none' };
  readonly json: boolean;
};

type TargetReport = {
  readonly artifact: string;
  readonly floorBytes: number;
  readonly executableBytes: number;
  readonly cliCodeBytes: number;
  readonly companionBytes: number;
  readonly installedBytes: number;
  readonly zipBytes: number;
  readonly tarXzBytes: number;
  readonly releaseZipBytes: number | undefined;
};

const parseOptions = (args: ReadonlyArray<string>): Options => {
  const { values } = parseArgs({
    args: [...args],
    options: {
      target: { type: 'string', multiple: true, default: [] },
      all: { type: 'boolean', default: false },
      release: { type: 'string' },
      'no-release': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
    },
  });
  const hostTarget = HOST_TARGETS[`${process.platform}-${process.arch}`];
  const targetNames = values.all
    ? RELEASE_TARGETS.map(({ bunTarget }) => bunTarget)
    : values.target.length > 0
      ? values.target
      : hostTarget === undefined
        ? []
        : [hostTarget];
  const targets = targetNames.map(name => {
    const target = RELEASE_TARGETS.find(({ bunTarget }) => bunTarget === name);
    if (target === undefined) {
      throw new Error(
        `Unknown target ${name}. Valid targets: ${RELEASE_TARGETS.map(({ bunTarget }) => bunTarget).join(', ')}`
      );
    }
    return target;
  });
  if (targets.length === 0) {
    throw new Error(
      `No release target for this host (${process.platform}-${process.arch}); pass --target.`
    );
  }
  return {
    targets,
    release: values['no-release']
      ? { kind: 'none' }
      : values.release === undefined
        ? { kind: 'latest' }
        : { kind: 'tag', tag: values.release },
    json: values.json,
  };
};

const sizeOf = async (target: string): Promise<number> => {
  const info = await stat(target);
  if (!info.isDirectory()) return info.size;
  const entries = await readdir(target);
  const sizes = await Promise.all(entries.map(entry => sizeOf(path.join(target, entry))));
  return sizes.reduce((total, size) => total + size, 0);
};

const releaseAssets = (release: Options['release']) =>
  Match.value(release).pipe(
    Match.discriminatorsExhaustive('kind')({
      none: () => Effect.succeedNone,
      tag: ({ tag }) => Effect.map(fetchReleaseByTag(tag), Option.some),
      latest: () => findLatestStableCliRelease,
    }),
    Effect.map(
      Option.map(chosen => ({
        tag: chosen.tag_name,
        sizes: new Map(
          chosen.assets.flatMap(({ name, size }) =>
            size === undefined ? [] : [[name, size] as const]
          )
        ),
      }))
    ),
    Effect.map(Option.getOrUndefined)
  );

/** Lay out an archive's files the way `package-binaries.ts` does, without the manifest and placeholders. */
const archiveSizes = async (
  workDir: string,
  artifact: string,
  executable: string,
  companionsDir: string
): Promise<{ readonly zipBytes: number; readonly tarXzBytes: number }> => {
  const stagingDir = path.join(workDir, `stage-${artifact}`);
  const nestedDir = path.join(stagingDir, artifact);
  await $`mkdir -p ${nestedDir}`.quiet();
  await $`cp ${executable} ${path.join(nestedDir, archiveExecutableName(artifact))}`.quiet();
  await $`cp -R ${companionsDir}/. ${nestedDir}`.quiet();
  const zipPath = path.join(workDir, `${artifact}.zip`);
  const tarXzPath = path.join(workDir, `${artifact}.tar.xz`);
  await $`zip -q -r ${zipPath} ${artifact}`.cwd(stagingDir).quiet();
  await $`tar -cf - ${artifact} | xz -9e -T0 > ${tarXzPath}`.cwd(stagingDir).quiet();
  return { zipBytes: await sizeOf(zipPath), tarXzBytes: await sizeOf(tarXzPath) };
};

const mib = (bytes: number | undefined): string =>
  bytes === undefined ? '—' : `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;

const signedMib = (bytes: number | undefined): string =>
  bytes === undefined ? '—' : `${bytes >= 0 ? '+' : '−'}${mib(Math.abs(bytes))}`;

/** Text from the GitHub API as one markdown table cell: no pipes, backslashes or line breaks. */
const tableCellText = (text: string): string => text.replace(/[\\|]/g, '\\$&').replace(/\s+/g, ' ');

const markdownTable = (reports: ReadonlyArray<TargetReport>, releaseTag: string | undefined) =>
  [
    `| Target | Floor (Bun alone) | Executable | CLI code | Companions | Installed | Zip | .tar.xz | Release zip${releaseTag ? ` (${tableCellText(releaseTag)})` : ''} | Zip vs release |`,
    '|---|---|---|---|---|---|---|---|---|---|',
    ...reports
      .map(report =>
        [
          report.artifact,
          mib(report.floorBytes),
          mib(report.executableBytes),
          mib(report.cliCodeBytes),
          mib(report.companionBytes),
          mib(report.installedBytes),
          mib(report.zipBytes),
          mib(report.tarXzBytes),
          mib(report.releaseZipBytes),
          signedMib(
            report.releaseZipBytes === undefined
              ? undefined
              : report.zipBytes - report.releaseZipBytes
          ),
        ].join(' | ')
      )
      .map(row => `| ${row} |`),
  ].join('\n');

export function sizeReport(options: Options) {
  return Effect.gen(function* () {
    const workDir = yield* Effect.promise(() => mkdtemp(path.join(os.tmpdir(), 'composio-size-')));
    yield* Effect.addFinalizer(() =>
      Effect.promise(() => rm(workDir, { recursive: true, force: true }))
    );

    const floorEntry = path.join(workDir, 'floor.ts');
    yield* Effect.promise(() => writeFile(floorEntry, 'console.log(process.argv.length);\n'));

    const companionsDir = path.join(workDir, 'companions');
    yield* buildCompanionModules(companionsDir);
    const companionBytes = yield* Effect.promise(() => sizeOf(companionsDir));

    const release = yield* releaseAssets(options.release);

    const reports: TargetReport[] = [];
    for (const { bunTarget, artifact } of options.targets) {
      yield* Console.error(`Measuring ${artifact}...`);
      // Bun appends `.exe` to Windows executables; name them so the paths match.
      const executableName = compiledBinaryFileName(artifact);
      const floor = yield* compileExecutable(
        path.join(workDir, 'floor', executableName),
        bunTarget,
        floorEntry
      );
      const executable = yield* compileExecutable(path.join(workDir, executableName), bunTarget);
      const floorBytes = yield* Effect.promise(() => sizeOf(floor));
      const executableBytes = yield* Effect.promise(() => sizeOf(executable));
      const archives = yield* Effect.promise(() =>
        archiveSizes(workDir, artifact, executable, companionsDir)
      );
      reports.push({
        artifact,
        floorBytes,
        executableBytes,
        cliCodeBytes: executableBytes - floorBytes,
        companionBytes,
        installedBytes: executableBytes + companionBytes,
        ...archives,
        releaseZipBytes: release?.sizes.get(`${artifact}.zip`),
      });
    }

    yield* Console.log(
      options.json
        ? JSON.stringify({ release: release?.tag, targets: reports }, null, 2)
        : markdownTable(reports, release?.tag)
    );
  });
}

const ConfigLive = Effect.gen(function* () {
  const logLevel = yield* Config.LogLevel('COMPOSIO_LOG_LEVEL').pipe(Config.withDefault('Warn'));

  return Layer.succeed(References.MinimumLogLevel, logLevel);
}).pipe(Layer.unwrap, Layer.merge(ConfigProvider.layer(ConfigProvider.fromEnv())));

if (require.main === module) {
  sizeReport(parseOptions(process.argv.slice(2))).pipe(
    Effect.provide(ConfigLive),
    // Logs go to stderr so `--json` output stays parseable.
    Effect.provide(
      Layer.merge(Logger.layer([Logger.consolePretty()]), Layer.succeed(Logger.LogToStderr, true))
    ),
    Effect.provide(Layer.merge(BunServices.layer, FetchHttpClient.layer)),
    Effect.scoped,
    Effect.map(() => ({ message: 'Process completed successfully.' })),
    BunRuntime.runMain({
      teardown,
    })
  );
}
