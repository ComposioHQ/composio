import path from 'node:path';
import { Effect, Option } from 'effect';
import { FileSystem } from '@effect/platform';
import { NodeOs } from 'src/services/node-os';
import { NodeProcess } from 'src/services/node-process';
import { APP_CONFIG } from 'src/effects/app-config';
import * as constants from 'src/constants';
import { type ProjectKeys, projectKeysFromJSON } from 'src/models/project-keys';
import type { PlatformError } from '@effect/platform/Error';
import type { ParseError } from 'effect/ParseResult';

/**
 * Keys allowed in `.composio/.env` files.
 * Only project context keys are permitted -- NOT API_KEY or BASE_URL,
 * to prevent credential injection via malicious repo clones.
 */
const ALLOWED_ENV_KEYS = new Set(['COMPOSIO_ORG_ID', 'COMPOSIO_PROJECT_ID']);

/**
 * Parse a `.env` file into a key-value map.
 * Only keys in the ALLOWED_ENV_KEYS set are returned.
 */
const parseEnvFile = (content: string): Map<string, string> => {
  const result = new Map<string, string>();
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // Strip surrounding quotes (single or double) consistent with dotenv convention
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (ALLOWED_ENV_KEYS.has(key)) {
      result.set(key, value);
    }
  }
  return result;
};

/**
 * Service that resolves the current project context using a precedence chain.
 * Read-only -- it does NOT write files.
 *
 * Precedence (highest first):
 * 1. System env vars (COMPOSIO_ORG_ID, COMPOSIO_PROJECT_ID)
 * 2. Per-directory .composio/.env (only allowed keys)
 * 3. Per-directory .composio/project.json (walk up from CWD, stop at homedir)
 */
export class ProjectContext extends Effect.Service<ProjectContext>()('services/ProjectContext', {
  effect: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const proc = yield* NodeProcess;
    const os = yield* NodeOs;

    return {
      /**
       * Resolves the current org+project context.
       * Returns Option.none() if no context is configured.
       */
      resolve: Effect.gen(function* () {
        // 1. Check env vars (highest priority)
        const envOrgId = yield* APP_CONFIG.ORG_ID;
        const envProjectId = yield* APP_CONFIG.PROJECT_ID;
        if (Option.isSome(envOrgId) && Option.isSome(envProjectId)) {
          yield* Effect.logDebug('ProjectContext: resolved from env vars');
          return Option.some<ProjectKeys>({
            orgId: envOrgId.value,
            projectId: envProjectId.value,
            projectName: Option.none(),
            orgName: Option.none(),
            email: Option.none(),
          });
        }

        // 2. Walk up from CWD, stop at homedir (not filesystem root)
        let dir = proc.cwd;
        const stopAt = os.homedir;

        while (true) {
          const composioDir = path.join(dir, constants.PROJECT_COMPOSIO_DIR);

          // 2a. Check .composio/.env
          const envFilePath = path.join(composioDir, constants.PROJECT_ENV_FILE_NAME);
          const envExists = yield* fs
            .exists(envFilePath)
            .pipe(Effect.catchAll(() => Effect.succeed(false)));
          if (envExists) {
            const envContent = yield* fs
              .readFileString(envFilePath)
              .pipe(Effect.catchAll(() => Effect.succeed('')));
            const envMap = parseEnvFile(envContent);
            const envFileOrgId = envMap.get('COMPOSIO_ORG_ID');
            const envFileProjectId = envMap.get('COMPOSIO_PROJECT_ID');
            if (envFileOrgId && envFileProjectId) {
              yield* Effect.logDebug(`ProjectContext: resolved from ${envFilePath}`);
              return Option.some<ProjectKeys>({
                orgId: envFileOrgId,
                projectId: envFileProjectId,
                projectName: Option.none(),
                orgName: Option.none(),
                email: Option.none(),
              });
            }
          }

          // 2b. Check .composio/project.json
          const projectJsonPath = path.join(composioDir, constants.PROJECT_CONFIG_FILE_NAME);
          const jsonExists = yield* fs
            .exists(projectJsonPath)
            .pipe(Effect.catchAll(() => Effect.succeed(false)));
          if (jsonExists) {
            const content = yield* fs
              .readFileString(projectJsonPath)
              .pipe(Effect.catchAll(() => Effect.succeed('')));
            if (content) {
              const keysOpt = yield* projectKeysFromJSON(content).pipe(
                Effect.map(Option.some),
                Effect.catchAll(error =>
                  Effect.gen(function* () {
                    yield* Effect.logDebug(
                      `ProjectContext: corrupt project.json at ${projectJsonPath}, skipping:`,
                      error
                    );
                    return Option.none();
                  })
                )
              );
              if (Option.isSome(keysOpt)) {
                yield* Effect.logDebug(`ProjectContext: resolved from ${projectJsonPath}`);
                return keysOpt;
              }
            }
          }

          // Stop at homedir to avoid reading from system directories
          if (dir === stopAt || dir === path.dirname(dir)) break;
          dir = path.dirname(dir);
        }

        // 3. Nothing found
        yield* Effect.logDebug('ProjectContext: no context found');
        return Option.none<ProjectKeys>();
      }),
    };
  }),
  dependencies: [],
}) {}
