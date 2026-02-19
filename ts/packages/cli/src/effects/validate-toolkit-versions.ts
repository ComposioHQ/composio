import { Effect } from 'effect';
import colors from 'picocolors';
import { S_BAR, unicodeOr } from '@clack/prompts';
import { TerminalUI } from 'src/services/terminal-ui';
import type {
  ComposioToolkitsRepository,
  InvalidVersionDetail,
} from 'src/services/composio-clients';
import type { ToolkitVersionOverrides } from './toolkit-version-overrides';

/**
 * Custom error class for invalid toolkit versions that preserves structured data.
 * This allows consumers to access both the human-readable message and the machine-readable data.
 */
export class InvalidToolkitVersionsValidationError extends Error {
  readonly invalidVersions: ReadonlyArray<InvalidVersionDetail>;

  constructor(invalidVersions: ReadonlyArray<InvalidVersionDetail>) {
    super(formatInvalidVersionsError(invalidVersions));
    this.name = 'InvalidToolkitVersionsValidationError';
    this.invalidVersions = invalidVersions;
  }

  /**
   * Returns a JSON-serializable representation of the error for programmatic access.
   */
  toJSON(): { error: string; invalidVersions: ReadonlyArray<InvalidVersionDetail> } {
    return {
      error: this.name,
      invalidVersions: this.invalidVersions,
    };
  }
}

const MAX_VERSIONS_TO_SHOW = 5;
const S_CORNER_BOTTOM_LEFT = unicodeOr('╰', '+');
const S_STEP_ERROR = unicodeOr('▲', 'x');

/**
 * Formats an InvalidToolkitVersionsError into a user-friendly error message.
 *
 * NOTE: We avoid using `: ` (colon-space) in the error message because effect-errors
 * splits on that pattern and converts the result to an array, which then renders
 * with commas instead of colons when converted back to string.
 */
export function formatInvalidVersionsError(
  invalidVersions: ReadonlyArray<InvalidVersionDetail>
): string {
  const lines: string[] = [];

  // Header
  lines.push(
    `${colors.red(S_STEP_ERROR)} ${colors.red('Invalid toolkit version override')}${invalidVersions.length > 1 ? 's' : ''}`
  );
  lines.push('');

  for (let i = 0; i < invalidVersions.length; i++) {
    const { toolkit, requestedVersion, availableVersions } = invalidVersions[i];
    const isLast = i === invalidVersions.length - 1;
    const connector = isLast ? S_CORNER_BOTTOM_LEFT : S_BAR;

    // Toolkit header with version
    lines.push(
      `${colors.gray(connector)} ${colors.cyan(toolkit.toUpperCase())} ${colors.dim('→')} version ${colors.yellow(`"${requestedVersion}"`)} ${colors.red('not found')}`
    );

    // Available versions (use → instead of : to avoid effect-errors split issue)
    if (availableVersions.length === 0) {
      lines.push(
        `${colors.gray(isLast ? ' ' : S_BAR)}   ${colors.dim('No versions available (toolkit may not support versioning)')}`
      );
    } else {
      const versionsToShow = availableVersions.slice(0, MAX_VERSIONS_TO_SHOW);
      const remaining = availableVersions.length - MAX_VERSIONS_TO_SHOW;

      let versionList = versionsToShow.map(v => colors.green(v)).join(colors.dim(', '));
      if (remaining > 0) {
        versionList += colors.dim(` (+${remaining} more)`);
      }

      lines.push(
        `${colors.gray(isLast ? ' ' : S_BAR)}   ${colors.dim('Available →')} ${versionList}`
      );
    }

    // Tip (use → instead of : to avoid effect-errors split issue)
    const envVarName = `COMPOSIO_TOOLKIT_VERSION_${toolkit.toUpperCase()}`;
    lines.push(
      `${colors.gray(isLast ? ' ' : S_BAR)}   ${colors.dim('Tip →')} Use ${colors.cyan('"latest"')} or unset ${colors.cyan(envVarName)}`
    );

    // Add spacing between toolkits (except for the last one)
    if (!isLast) {
      lines.push(colors.gray(S_BAR));
    }
  }

  return lines.join('\n');
}

/**
 * Options for validateToolkitVersionOverrides
 */
export interface ValidateVersionsOptions {
  /** Map of toolkit slug to requested version */
  readonly versionOverrides: ToolkitVersionOverrides;
  /** Optional array of toolkit slugs to filter (from --toolkits flag) */
  readonly toolkitSlugsFilter: ReadonlyArray<string> | null;
  /** The ComposioToolkitsRepository client */
  readonly client: ComposioToolkitsRepository;
}

/**
 * Result of version validation
 */
export interface ValidateVersionsResult {
  /** The validated overrides (only includes relevant toolkits) */
  readonly validatedOverrides: ToolkitVersionOverrides;
}

/**
 * Validates toolkit version overrides before fetching data.
 *
 * This function should be called early in the generate command flow,
 * before any tool/trigger data is fetched. It will:
 * 1. Log detected version overrides
 * 2. Validate versions against the API's available_versions
 * 3. Warn about unused overrides (when --toolkits filter excludes them)
 * 4. Fail with a descriptive error if any versions are invalid
 *
 * @example
 * ```typescript
 * const { validatedOverrides } = yield* validateToolkitVersionOverrides({
 *   versionOverrides,
 *   toolkitSlugsFilter,
 *   client,
 * });
 * ```
 */
export const validateToolkitVersionOverrides = ({
  versionOverrides,
  toolkitSlugsFilter,
  client,
}: ValidateVersionsOptions): Effect.Effect<ValidateVersionsResult, Error, TerminalUI> =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;

    // Skip if no overrides
    if (versionOverrides.size === 0) {
      return { validatedOverrides: versionOverrides };
    }

    // Log detected overrides
    const overrideLines = [...versionOverrides]
      .map(([toolkit, version]) => `  ${toolkit}: ${version}`)
      .join('\n');
    yield* ui.log.info(`Detected toolkit version overrides:\n${overrideLines}`);

    const { validatedOverrides, warnings } = yield* client
      .validateToolkitVersions(versionOverrides, toolkitSlugsFilter ?? undefined)
      .pipe(
        Effect.catchTag('services/InvalidToolkitVersionsError', error =>
          Effect.fail(new InvalidToolkitVersionsValidationError(error.invalidVersions))
        ),
        Effect.catchTag('services/InvalidToolkitsError', error =>
          Effect.fail(
            new Error(
              `Invalid toolkit(s) in version overrides: ${error.invalidToolkits.join(', ')}. ` +
                `Check that the toolkit slug is correct (e.g., COMPOSIO_TOOLKIT_VERSION_GMAIL, not COMPOSIO_TOOLKIT_VERSION_GMAL).`
            )
          )
        ),
        Effect.catchTag('services/HttpServerError', error =>
          Effect.fail(new Error(`Failed to validate toolkit versions: ${error.cause}`))
        ),
        Effect.catchTag('services/HttpDecodingError', error =>
          Effect.fail(new Error(`Failed to decode toolkit response: ${error.cause}`))
        ),
        Effect.catchTag('NoSuchElementException', () =>
          Effect.fail(new Error('API client not initialized'))
        )
      );

    // Log warnings for unused overrides
    for (const warning of warnings) {
      yield* ui.log.warn(`${warning}`);
    }

    return { validatedOverrides };
  });
