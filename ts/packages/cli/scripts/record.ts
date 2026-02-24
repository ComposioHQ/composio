#!/usr/bin/env bun

/**
 * Record CLI demo SVGs and asciicasts using VHS.
 *
 * Usage: `bun scripts/record.ts`
 *
 * Reads `recordings/recordings.yaml` and, for each recording entry:
 *   1. Generates a VHS `.tape` file       → `recordings/tapes/<group>/<name>.tape`
 *   2. Runs VHS to produce an SVG         → `recordings/svgs/<group>/<name>.svg`
 *   3. Runs VHS to produce an asciicast   → `recordings/ascii/<group>/<name>.ascii`
 *
 * Recordings run in parallel (concurrency = cpu count − 1).
 * Requires `vhs` and `composio` on PATH, and COMPOSIO_API_KEY in the environment.
 */

import process from 'node:process';
import path from 'node:path';
import os from 'node:os';
import { Cause, Config, ConfigProvider, Effect, Exit, Logger, Layer, LogLevel, Ref } from 'effect';
import { BunContext, BunFileSystem, BunRuntime } from '@effect/platform-bun';
import { FileSystem } from '@effect/platform';
import type { Teardown } from '@effect/platform/Runtime';
import { $ } from 'bun';
import * as p from '@clack/prompts';
import color from 'picocolors';

// --- Env vars ---

declare module 'bun' {
  interface Env {
    COMPOSIO_API_KEY: string;
  }
}

/**
 * Validates that env vars needed by the `composio` cli during VHS recording don't have undefined values.
 *
 * @param env - Environment variable dictionary
 * @throws Error if any env vars have undefined values
 */
function validateRequiredEnvVars(env: Record<string, string | undefined> | undefined): void {
  if (!env) return;

  const missingVars = Object.entries(env)
    .filter(([, value]) => value === undefined)
    .map(([key]) => key);

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}\n` +
        `Set these variables before running the tests.`
    );
  }
}

// Env vars to forward into VHS recordings.
const env = {
  // Disables Clack interactive decorations so .ascii output is readable.
  // See https://github.com/bombshell-dev/clack/pull/169
  CI: 'true',
  COMPOSIO_API_KEY: Bun.env.COMPOSIO_API_KEY,
} as const;

validateRequiredEnvVars(env);

// --- Constannts ---

const CONCURRENCY = Math.max(os.cpus().length - 1, 1);

// --- Types ---

interface VhsConfig {
  shell: string;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  padding: number;
  theme: string;
  typingSpeed: string;
  framerate: number;
  cursorBlink: boolean;
  windowBar: string;
  sleepAfterEnter: string;
}

interface Recording {
  name: string;
  command: string;
  description?: string;
  sleepAfterEnter?: string;
  height?: 'dynamic' | number;
}

interface RecordingsConfig {
  vhs: VhsConfig;
  recordings: Record<string, Recording[]>;
}

// --- Tape generation ---

/**
 * Wraps a value in a VHS-compatible quoted string.
 *
 * VHS supports three string delimiters (`"`, `'`, `` ` ``) and NONE support
 * escape sequences — the delimiter character always terminates the string.
 * We pick a delimiter that doesn't appear in the value.
 *
 * @see https://github.com/charmbracelet/vhs/discussions/141
 */
function vhsQuote(value: string): string {
  if (!value.includes('"')) return `"${value}"`;
  if (!value.includes('`')) return `\`${value}\``;
  if (!value.includes("'")) return `'${value}'`;
  throw new Error(
    `Cannot quote VHS string — value contains all three delimiters (" ' \`): ${value}`
  );
}

function generateSharedTape(vhs: VhsConfig): string {
  // VHS requires ALL Set directives before any non-Set directive (Require, Env, etc.).
  // Placing Require/Env before Set causes VHS to silently ignore the Set directives.
  const lines = [
    `Set Shell ${vhs.shell}`,
    `Set Width ${vhs.width}`,
    // Height is intentionally omitted — set per-recording tape to support dynamic heights.
    `Set FontSize ${vhs.fontSize}`,
    `Set FontFamily ${vhsQuote(vhs.fontFamily)}`,
    `Set Padding ${vhs.padding}`,
    `Set Theme ${vhsQuote(vhs.theme)}`,
    `Set TypingSpeed ${vhs.typingSpeed}`,
    `Set Framerate ${vhs.framerate}`,
    `Set CursorBlink ${vhs.cursorBlink}`,
    `Set WindowBar ${vhs.windowBar}`,
    `Require composio`,
    `Env CI ${vhsQuote(env.CI)}`,
  ];
  return lines.join('\n') + '\n';
}

function generateRecordingTape(opts: {
  sharedTapePath: string;
  outputPaths: string[];
  command: string;
  description?: string;
  sleepAfterEnter: string;
  height: number;
}): string {
  const lines = [`Set Height ${opts.height}`, `Source ${vhsQuote(opts.sharedTapePath)}`];
  lines.push(...opts.outputPaths.map(p => `Output ${vhsQuote(p)}`), '');

  if (opts.description) {
    lines.push('Hide');
    lines.push(`Type ${vhsQuote(`# ${opts.description}`)}`);
    lines.push('Enter');
    lines.push('Show');
  }

  // Split multi-line commands into separate Type/Enter directives.
  // For single-line commands, the loop runs once with the usual Sleep/Enter/Sleep after.
  // For multi-line commands (with `\` continuations), each line gets its own Type/Enter
  // pair so bash enters continuation mode between lines.
  const commandLines = opts.command.split('\n');
  for (let i = 0; i < commandLines.length; i++) {
    lines.push(`Type ${vhsQuote(commandLines[i]!)}`);
    if (i < commandLines.length - 1) {
      lines.push('Enter');
    }
  }
  lines.push('Sleep 300ms', 'Enter', `Sleep ${opts.sleepAfterEnter}`);

  return lines.join('\n') + '\n';
}

// --- Dynamic height ---

/** Pixel overhead for window bar + padding + chrome (VHS height 750 → 480px content area). */
const CHROME_PX = 270;

/**
 * Parse a VHS-generated SVG to find the maximum `y` attribute from `<text>` elements
 * in the last animation frame. Returns the pixel offset of the lowest text line.
 */
function parseMaxContentY(svg: string): number {
  // Find the last animation frame (highest translate X value).
  const frameRe = /<g transform="translate\((\d+),0\)">/g;
  let maxX = 0;
  let lastFrameIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = frameRe.exec(svg)) !== null) {
    const x = parseInt(m[1]!, 10);
    if (x >= maxX) {
      maxX = x;
      lastFrameIdx = m.index;
    }
  }

  // Slice the last frame (up to the next frame or closing container tag).
  const nextFrame = svg.indexOf('<g transform="translate(', lastFrameIdx + 1);
  const frame = svg.slice(lastFrameIdx, nextFrame > lastFrameIdx ? nextFrame : undefined);

  // Find the max y across all <text> elements in that frame.
  const yRe = /<text y="(\d+)"/g;
  let maxY = 0;
  while ((m = yRe.exec(frame)) !== null) {
    maxY = Math.max(maxY, parseInt(m[1]!, 10));
  }
  return maxY;
}

// --- Progress bar ---

const BAR_SIZE = 30;

function drawBar(current: number, max: number): string {
  const filled = Math.round((current / max) * BAR_SIZE);
  const empty = BAR_SIZE - filled;
  return `${color.green('━'.repeat(filled))}${color.gray('─'.repeat(empty))}`;
}

// --- Recording ---

function runVhs(tapePath: string, cliRoot: string, label: string) {
  return Effect.tryPromise({
    try: async () => {
      const r = await $`vhs ${tapePath}`.cwd(cliRoot).quiet().nothrow();
      if (r.exitCode !== 0) {
        throw new Error(`vhs exited with code ${r.exitCode}\n${r.stderr.toString()}`);
      }
    },
    catch: err => new Error(`Failed to record ${label}: ${err}`),
  });
}

function recordCommand(opts: {
  group: string;
  recording: Recording;
  defaultSleepAfterEnter: string;
  sharedTapePath: string;
  svgsDir: string;
  asciiDir: string;
  tapesDir: string;
  cliRoot: string;
  vhsHeight: number;
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const {
      group,
      recording,
      defaultSleepAfterEnter,
      sharedTapePath,
      svgsDir,
      asciiDir,
      tapesDir,
      cliRoot,
      vhsHeight,
    } = opts;
    const rel = (absPath: string) => path.relative(cliRoot, absPath);
    const label = `${group}/${recording.name}`;

    const sleepAfterEnter = recording.sleepAfterEnter ?? defaultSleepAfterEnter;
    const maxHeight = vhsHeight * 2;

    // Resolve the recording height: explicit number, dynamic (two-pass), or default.
    let height = vhsHeight;
    if (typeof recording.height === 'number') {
      height = recording.height;
    } else if (recording.height === 'dynamic') {
      const probeSvgPath = path.join(tapesDir, group, `${recording.name}.probe.svg`);
      const probeTapePath = path.join(tapesDir, group, `${recording.name}.probe.tape`);

      const probeTape = generateRecordingTape({
        sharedTapePath: rel(sharedTapePath),
        outputPaths: [rel(probeSvgPath)],
        command: recording.command,
        description: recording.description,
        sleepAfterEnter,
        height: maxHeight,
      });
      yield* fs.writeFileString(probeTapePath, probeTape);
      yield* runVhs(probeTapePath, cliRoot, `${label} (probe)`);

      // Parse the probe SVG for the lowest text line in the final frame.
      const svg = yield* fs.readFileString(probeSvgPath);
      const maxY = parseMaxContentY(svg);
      height = Math.min(Math.max(maxY + CHROME_PX, vhsHeight), maxHeight);

      yield* Effect.logDebug(`[probe] ${label}: maxY=${maxY} → height=${height}`);

      // Clean up probe artifacts.
      yield* fs.remove(probeSvgPath).pipe(Effect.orElse(() => Effect.void));
      yield* fs.remove(probeTapePath).pipe(Effect.orElse(() => Effect.void));
    }

    // Final recording pass (or the only pass for fixed-height recordings).
    const tapeContent = generateRecordingTape({
      sharedTapePath: rel(sharedTapePath),
      outputPaths: [
        rel(path.join(svgsDir, group, `${recording.name}.svg`)),
        rel(path.join(asciiDir, group, `${recording.name}.ascii`)),
      ],
      command: recording.command,
      description: recording.description,
      sleepAfterEnter,
      height,
    });

    const tapePath = path.join(tapesDir, group, `${recording.name}.tape`);
    yield* fs.writeFileString(tapePath, tapeContent);
    yield* runVhs(tapePath, cliRoot, label);
  });
}

function recordAll() {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    yield* Effect.sync(() => p.intro('composio record'));

    // Tape-embedded paths are relative to the cli package root (ts/packages/cli/).
    const scriptDir = path.resolve(
      import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname)
    );
    const cliRoot = path.resolve(scriptDir, '..');
    const recordingsDir = path.resolve(scriptDir, '..', 'recordings');
    const configPath = path.join(recordingsDir, 'recordings.yaml');

    yield* Effect.logDebug(`Reading config from ${configPath}`);

    const configRaw = yield* fs.readFileString(configPath);
    const config = Bun.YAML.parse(configRaw) as RecordingsConfig;

    // Output directories for generated tapes, SVGs, and asciicasts.
    const tapesDir = path.join(recordingsDir, 'tapes');
    const svgsDir = path.join(recordingsDir, 'svgs');
    const asciiDir = path.join(recordingsDir, 'ascii');
    yield* fs.makeDirectory(tapesDir, { recursive: true });
    yield* fs.makeDirectory(svgsDir, { recursive: true });
    yield* fs.makeDirectory(asciiDir, { recursive: true });

    // Write shared config tape.
    const sharedTapePath = path.join(tapesDir, 'shared-config.tape');
    yield* fs.writeFileString(sharedTapePath, generateSharedTape(config.vhs));

    yield* Effect.sync(() =>
      p.log.step(`Loaded config from ${color.dim(path.relative(process.cwd(), configPath))}`)
    );

    // Flatten all recordings across groups.
    const groups = Object.entries(config.recordings);
    const allRecordings = groups.flatMap(([group, recordings]) =>
      recordings.map(recording => ({ group, recording }))
    );
    const total = allRecordings.length;

    // Create all group directories upfront.
    const groupNames = [...new Set(groups.map(([g]) => g))];
    yield* Effect.forEach(
      groupNames,
      group =>
        Effect.all([
          fs.makeDirectory(path.join(svgsDir, group), { recursive: true }),
          fs.makeDirectory(path.join(asciiDir, group), { recursive: true }),
          fs.makeDirectory(path.join(tapesDir, group), { recursive: true }),
        ]),
      { concurrency: 'unbounded' }
    );

    // Record all with bounded concurrency and a single progress spinner.
    yield* Effect.sync(() =>
      p.log.step(
        `Recording ${color.bold(String(total))} commands ${color.dim(`(concurrency: ${CONCURRENCY})`)}`
      )
    );
    const completed = yield* Ref.make(0);
    const spin = p.spinner();
    yield* Effect.sync(() => spin.start(`${drawBar(0, total)} ${color.dim(`0/${total}`)}`));

    yield* Effect.forEach(
      allRecordings,
      ({ group, recording }) =>
        recordCommand({
          group,
          recording,
          defaultSleepAfterEnter: config.vhs.sleepAfterEnter,
          sharedTapePath,
          svgsDir,
          asciiDir,
          tapesDir,
          cliRoot,
          vhsHeight: config.vhs.height,
        }).pipe(
          Effect.tap(() =>
            Ref.updateAndGet(completed, c => c + 1).pipe(
              Effect.tap(n =>
                Effect.sync(() =>
                  spin.message(
                    `${drawBar(n, total)} ${color.dim(`${n}/${total}`)} ${group}/${recording.name}`
                  )
                )
              )
            )
          ),
          Effect.tapError(err =>
            Ref.get(completed).pipe(
              Effect.tap(n =>
                Effect.sync(() => {
                  spin.error(
                    `${drawBar(n, total)} ${color.bold(group)} failed at ${recording.name}`
                  );
                  p.log.error(String(err));
                })
              )
            )
          )
        ),
      { concurrency: CONCURRENCY }
    );

    yield* Effect.sync(() =>
      spin.stop(`${drawBar(total, total)} ${color.dim(`${total}/${total}`)} ${color.green('done')}`)
    );

    // Collect file sizes.
    let totalBytes = 0n;
    for (const { group, recording } of allRecordings) {
      for (const filePath of [
        path.join(svgsDir, group, `${recording.name}.svg`),
        path.join(asciiDir, group, `${recording.name}.ascii`),
      ]) {
        const stat = yield* fs
          .stat(filePath)
          .pipe(Effect.orElse(() => Effect.succeed({ size: 0n } as { size: bigint })));
        totalBytes += BigInt(stat.size);
      }
    }

    const totalKB = (Number(totalBytes) / 1024).toFixed(1);

    yield* Effect.sync(() =>
      p.note(
        [
          `${color.bold(String(total))} recordings`,
          `${color.bold(totalKB)} KB total`,
          color.dim(`${path.relative(process.cwd(), recordingsDir)}/`),
        ].join('\n'),
        'Summary'
      )
    );

    yield* Effect.sync(() => p.outro('Recording complete'));
  });
}

// --- Bootstrap ---

export const teardown: Teardown = <E, A>(exit: Exit.Exit<E, A>, onExit: (code: number) => void) => {
  const shouldFail = Exit.isFailure(exit) && !Cause.isInterruptedOnly(exit.cause);
  const errorCode = Number(process.exitCode ?? 1);
  onExit(shouldFail ? errorCode : 0);
};

const ConfigLive = Effect.gen(function* () {
  const logLevel = yield* Config.logLevel('COMPOSIO_LOG_LEVEL').pipe(
    Config.withDefault(LogLevel.Info)
  );

  return Logger.minimumLogLevel(logLevel);
}).pipe(Layer.unwrapEffect, Layer.merge(Layer.setConfigProvider(ConfigProvider.fromEnv())));

recordAll().pipe(
  Effect.provide(ConfigLive),
  Effect.provide(Logger.pretty),
  Effect.provide(BunContext.layer),
  Effect.provide(BunFileSystem.layer),
  Effect.map(() => ({ message: 'Process completed successfully.' })),
  BunRuntime.runMain({
    teardown,
  })
);
