import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Effect, Option } from 'effect';
import { getOrCreateProbablyMyCliSessionIdForCurrentCwd } from 'src/services/consumer-short-term-cache';
import { resolveCliConfigPathSync } from 'src/services/cli-user-config';

const readConfiguredArtifactDirectory = (): string | undefined => {
  try {
    const raw = fs.readFileSync(resolveCliConfigPathSync(), 'utf8');
    const parsed = JSON.parse(raw) as { artifact_directory?: unknown };
    return typeof parsed.artifact_directory === 'string' &&
      parsed.artifact_directory.trim().length > 0
      ? parsed.artifact_directory.trim()
      : undefined;
  } catch {
    return undefined;
  }
};

export const resolveArtifactsRoot = (): string =>
  process.env.COMPOSIO_SESSION_DIR?.trim() ||
  process.env.COMPOSIO_CACHE_DIR?.trim() ||
  readConfiguredArtifactDirectory() ||
  path.join(os.tmpdir(), 'composio');

const SESSION_HISTORY_FILE = 'session-history.jsonl';

export type CliSessionArtifacts = {
  readonly sessionId: string;
  readonly directoryPath: string;
  readonly historyFilePath: string;
};

const randomToken = (length = 8) => crypto.randomUUID().replace(/-/g, '').slice(0, length);

const sanitizeArtifactName = (value: string): string =>
  value.replace(/[^A-Z0-9_]+/gi, '_').replace(/^_+|_+$/g, '') || 'ARTIFACT';

export const resolveCliSessionArtifacts = (params?: {
  readonly orgId?: string;
  readonly consumerUserId?: string;
}) =>
  Effect.gen(function* () {
    const sessionIdOption = yield* getOrCreateProbablyMyCliSessionIdForCurrentCwd(params).pipe(
      Effect.catchAll(() => Effect.succeed(Option.none<string>()))
    );
    if (Option.isNone(sessionIdOption)) {
      return Option.none<CliSessionArtifacts>();
    }

    const directoryPath = path.join(resolveArtifactsRoot(), sessionIdOption.value);
    try {
      fs.mkdirSync(directoryPath, { recursive: true });
    } catch {
      return Option.none<CliSessionArtifacts>();
    }
    return Option.some({
      sessionId: sessionIdOption.value,
      directoryPath,
      historyFilePath: path.join(directoryPath, SESSION_HISTORY_FILE),
    } satisfies CliSessionArtifacts);
  });

export const appendCliSessionHistory = (params: {
  readonly entry: Record<string, unknown>;
  readonly orgId?: string;
  readonly consumerUserId?: string;
}) =>
  Effect.gen(function* () {
    const artifactsOption = yield* resolveCliSessionArtifacts({
      orgId: params.orgId,
      consumerUserId: params.consumerUserId,
    });
    if (Option.isNone(artifactsOption)) {
      return;
    }

    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      sessionId: artifactsOption.value.sessionId,
      ...params.entry,
    });
    try {
      fs.appendFileSync(artifactsOption.value.historyFilePath, `${line}\n`, 'utf8');
    } catch {
      // Best-effort — session history write is non-fatal.
    }
  });

export const storeCliSessionArtifact = (params: {
  readonly contents: string;
  readonly name: string;
  readonly extension?: string;
  readonly directoryPath?: string;
  readonly orgId?: string;
  readonly consumerUserId?: string;
}) =>
  Effect.gen(function* () {
    const directoryPath =
      params.directoryPath ||
      Option.getOrUndefined(
        yield* resolveCliSessionArtifacts({
          orgId: params.orgId,
          consumerUserId: params.consumerUserId,
        }).pipe(Effect.map(Option.map(artifacts => artifacts.directoryPath)))
      ) ||
      path.join(resolveArtifactsRoot(), `adhoc_${randomToken(12)}`);

    try {
      fs.mkdirSync(directoryPath, { recursive: true });
      const extension = (params.extension ?? 'json').replace(/^\.+/, '') || 'json';
      const filePath = path.join(
        directoryPath,
        `${sanitizeArtifactName(params.name)}_${randomToken()}.${extension}`
      );
      fs.writeFileSync(filePath, params.contents, 'utf8');
      return filePath;
    } catch {
      return undefined;
    }
  });
