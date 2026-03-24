import fs from 'node:fs';
import path from 'node:path';
import { Effect, Option } from 'effect';
import { getOrCreateProbablyMyCliSessionIdForCurrentCwd } from 'src/services/consumer-short-term-cache';

const CLI_SESSION_ARTIFACTS_ROOT = '/tmp/composio';
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
    const sessionIdOption = yield* getOrCreateProbablyMyCliSessionIdForCurrentCwd(params);
    if (Option.isNone(sessionIdOption)) {
      return Option.none<CliSessionArtifacts>();
    }

    const directoryPath = path.join(CLI_SESSION_ARTIFACTS_ROOT, sessionIdOption.value);
    fs.mkdirSync(directoryPath, { recursive: true });
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
    fs.appendFileSync(artifactsOption.value.historyFilePath, `${line}\n`, 'utf8');
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
      path.join(CLI_SESSION_ARTIFACTS_ROOT, `adhoc_${randomToken(12)}`);

    fs.mkdirSync(directoryPath, { recursive: true });
    const extension = (params.extension ?? 'json').replace(/^\.+/, '') || 'json';
    const filePath = path.join(
      directoryPath,
      `${sanitizeArtifactName(params.name)}_${randomToken()}.${extension}`
    );
    fs.writeFileSync(filePath, params.contents, 'utf8');
    return filePath;
  });
