import { Data, Effect, String } from 'effect';
import type { Toolkit } from 'src/models/toolkits';
import type { ToolkitVersionOverrides } from 'src/effects/toolkit-version-overrides';
import type { ClientError } from './composio-errors';
import { MAX_CONCURRENT_REQUESTS_PER_ENDPOINT } from './composio-request';

/**
 * Error thrown when one or more toolkit slugs are invalid.
 */
export class InvalidToolkitsError extends Data.TaggedError('services/InvalidToolkitsError')<{
  readonly invalidToolkits: ReadonlyArray<string>;
  readonly availableToolkits: ReadonlyArray<string>;
}> {}

/**
 * Details about a single invalid version override.
 */
export interface InvalidVersionDetail {
  readonly toolkit: string;
  readonly requestedVersion: string;
  readonly availableVersions: ReadonlyArray<string>;
}

/**
 * Error thrown when one or more toolkit version overrides are invalid.
 */
export class InvalidToolkitVersionsError extends Data.TaggedError(
  'services/InvalidToolkitVersionsError'
)<{
  readonly invalidVersions: ReadonlyArray<InvalidVersionDetail>;
}> {}

/**
 * Converts a 404 from a toolkit lookup into `InvalidToolkitsError` naming
 * that slug; every other failure propagates unchanged.
 */
export const invalidToolkitOn404 = <A>(slug: string, toolkit: Effect.Effect<A, ClientError>) =>
  Effect.catchTag(toolkit, '@composio/client/NotFoundError', () =>
    Effect.fail(
      new InvalidToolkitsError({
        invalidToolkits: [slug],
        availableToolkits: [],
      })
    )
  );

export const validateToolkitVersionsImpl = (
  retrieveToolkit: (slug: string) => Effect.Effect<Toolkit, ClientError, never>,
  overrides: ToolkitVersionOverrides,
  relevantToolkits?: ReadonlyArray<string>
): Effect.Effect<
  {
    validatedOverrides: ToolkitVersionOverrides;
    warnings: ReadonlyArray<string>;
  },
  InvalidToolkitVersionsError | InvalidToolkitsError | ClientError
> =>
  Effect.gen(function* () {
    const determineOverridesToValidate = (
      overrides: ToolkitVersionOverrides,
      relevantToolkits?: ReadonlyArray<string>
    ): {
      overridesToValidate: Array<[toolkit: string, requestedVersion: string]>;
      warnings: Array<string>;
    } => {
      const warnings: string[] = [];
      const overridesToValidate: Array<[toolkit: string, requestedVersion: string]> = [];

      if (relevantToolkits) {
        const relevantSet = new Set(relevantToolkits.map(s => String.toLowerCase(s)));

        for (const [toolkit, version] of overrides) {
          if (relevantSet.has(toolkit)) {
            overridesToValidate.push([toolkit, version]);
          } else {
            warnings.push(
              `Version override for "${toolkit}" will be ignored (toolkit not in --toolkits filter)`
            );
          }
        }
      } else {
        overridesToValidate.push(...overrides.entries());
      }

      return { overridesToValidate, warnings };
    };

    const fetchToolkitVersionValidationResults = (
      overridesToValidate: ReadonlyArray<[toolkit: string, requestedVersion: string]>
    ): Effect.Effect<
      ReadonlyArray<{
        toolkit: string;
        requestedVersion: string;
        availableVersions: ReadonlyArray<string>;
        isValid: boolean;
      }>,
      InvalidToolkitsError | ClientError
    > =>
      Effect.all(
        overridesToValidate.map(([toolkit, requestedVersion]) =>
          invalidToolkitOn404(
            toolkit,
            retrieveToolkit(toolkit).pipe(
              Effect.map(toolkitData => ({
                toolkit,
                requestedVersion,
                availableVersions: toolkitData.meta.available_versions,
                isValid: toolkitData.meta.available_versions.includes(requestedVersion),
              }))
            )
          )
        ),
        { concurrency: MAX_CONCURRENT_REQUESTS_PER_ENDPOINT }
      );

    const collectInvalidVersions = (
      validationResults: ReadonlyArray<{
        toolkit: string;
        requestedVersion: string;
        availableVersions: ReadonlyArray<string>;
        isValid: boolean;
      }>
    ): ReadonlyArray<InvalidVersionDetail> =>
      validationResults
        .filter(result => !result.isValid)
        .map(result => ({
          toolkit: result.toolkit,
          requestedVersion: result.requestedVersion,
          availableVersions: result.availableVersions,
        }));

    if (overrides.size === 0) {
      return { validatedOverrides: overrides, warnings: [] as ReadonlyArray<string> };
    }

    const { overridesToValidate, warnings } = determineOverridesToValidate(
      overrides,
      relevantToolkits
    );

    if (overridesToValidate.length === 0) {
      return {
        validatedOverrides: new Map() as ToolkitVersionOverrides,
        warnings: warnings as ReadonlyArray<string>,
      };
    }

    const validationResults = yield* fetchToolkitVersionValidationResults(overridesToValidate);
    const invalidVersions = collectInvalidVersions(validationResults);

    if (invalidVersions.length > 0) {
      return yield* Effect.fail(new InvalidToolkitVersionsError({ invalidVersions }));
    }

    const validatedOverrides = new Map(overridesToValidate) as ToolkitVersionOverrides;
    return { validatedOverrides, warnings: warnings as ReadonlyArray<string> };
  });
