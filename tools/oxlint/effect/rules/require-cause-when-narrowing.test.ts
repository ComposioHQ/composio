import { RuleTester } from 'oxlint/plugins-dev';

import { requireCauseWhenNarrowingRule } from './require-cause-when-narrowing.ts';

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } });
const imports = `
	import * as Effect from "effect/Effect";
`;
const missingCause = (operator: string, error: string) => ({
  messageId: 'missingCause',
  data: { operator, error },
});

tester.run('anti-slop-effect/require-cause-when-narrowing', requireCauseWhenNarrowingRule, {
  valid: [
    // A parameter can shadow an Effect import without referring to Effect.
    `import { Effect } from "effect";
     function recover(Effect: OtherLibrary) {
       return load.pipe(Effect.mapError(() => new Failed()));
     }`,
    `${imports}
		const a = decode(text).pipe(Effect.mapError((cause) => BadRequest.make({ reason: "Invalid JSON", cause })));
		const b = decode(text).pipe(Effect.mapError((error) => new BadRequest({ reason: error.message })));
		const c = decode(text).pipe(Effect.mapError(() => BadRequest.make({ reason: "Invalid JSON", ...details })));`,
    // Capture before narrowing.
    `${imports}
		const a = decode(text).pipe(Effect.tapError(Effect.logError), Effect.mapError(() => BadRequest.make({ reason: "Invalid JSON" })));
		const b = Effect.fn("decode")(function* () {}, Effect.tapCause(Effect.logError), Effect.catch(() => Effect.fail(new Failed())));
		const c = Effect.mapError(Effect.tapErrorCause(decode(text), Effect.logError), () => new Failed());`,
    // Specific expected tags are handled on purpose.
    `${imports}
		const a = load.pipe(Effect.catchTag("NotFound", () => Effect.fail(new Missing())));
		const b = load.pipe(Effect.catchTags({ NotFound: () => Effect.fail(new Missing()) }));`,
    // Recovering with a value, or constructing inside a nested function, is not narrowing.
    `${imports}
		const a = load.pipe(Effect.orElse(() => Effect.succeed(new Fallback())));
		const b = load.pipe(Effect.catch(() => Effect.sync(() => new Fallback())));
		const c = load.pipe(Effect.catch(() => Effect.succeed(Option.make(1))));`,
    `${imports}
    const preserved = load.pipe(Effect.mapError(() => retryable
      ? new RetryFailed({ cause })
      : Failed.make({ cause })));
    const recovered = load.pipe(Effect.catch(() => retryable
      ? Effect.succeed(new Fallback())
      : Effect.sync(() => new OtherFallback())));
    const deferred = load.pipe(Effect.catch(() => () => retryable
      ? new RetryFailed()
      : new Failed()));
    const discarded = load.pipe(Effect.mapError(() => (new Discarded(), Failed.make({ cause }))));
    const truthy = load.pipe(Effect.mapError(() => new Discarded() && Failed.make({ cause })));`,
    // Not Effect's Effect.
    `
		import * as Effect from "other-library";
		const a = load.pipe(Effect.mapError(() => new Failed()));`,
  ],
  invalid: [
    {
      code: `${imports}
      const conditional = load.pipe(Effect.mapError(() => retryable ? new RetryFailed() : new Failed()));
      const nested = load.pipe(Effect.mapError(() => retryable
        ? Failed.make({ cause })
        : offline ? Failed.make({ cause }) : new Offline()));
      const logical = load.pipe(Effect.mapError(() => fallback ?? new Missing()));
      const sequence = load.pipe(Effect.mapError(() => (record(), new Failed())));
      const failed = load.pipe(Effect.catch(() => Effect.fail(retryable ? new RetryFailed() : new Failed())));`,
      errors: [
        missingCause('Effect.mapError', 'RetryFailed'),
        missingCause('Effect.mapError', 'Offline'),
        missingCause('Effect.mapError', 'Missing'),
        missingCause('Effect.mapError', 'Failed'),
        missingCause('Effect.catch', 'RetryFailed'),
      ],
    },
    {
      code: `import { Effect as Fx } from "effect";
        const result = load.pipe(Fx.mapError(() => new Failed()));`,
      errors: [missingCause('Effect.mapError', 'Failed')],
    },
    {
      code: `${imports}
			const a = decode(text).pipe(Effect.mapError(() => BadRequest.make({ reason: "Invalid JSON" })));`,
      errors: [missingCause('Effect.mapError', 'BadRequest')],
    },
    {
      code: `${imports}
			const a = Effect.mapError(decode(text), (_error) => new McpDialFailed({ message: "bad frame" }));`,
      errors: [missingCause('Effect.mapError', 'McpDialFailed')],
    },
    {
      code: `${imports}
			const a = read.pipe(Effect.catch(() => AuthUnavailable.make({ error: "unavailable" })));
			const b = read.pipe(Effect.catchAll(() => Effect.fail(new Unavailable())));
			const c = read.pipe(Effect.orElse(() => Effect.gen(function* () {
				return yield* new Unavailable({ reason: "down" });
			})));
			const d = read.pipe(Effect.catchCause(() => { return Effect.fail(Errors.Unavailable.make()); }));`,
      errors: [
        missingCause('Effect.catch', 'AuthUnavailable'),
        missingCause('Effect.catchAll', 'Unavailable'),
        missingCause('Effect.orElse', 'Unavailable'),
        missingCause('Effect.catchCause', 'Errors.Unavailable'),
      ],
    },
    {
      code: `${imports}
			const a = read.pipe(Effect.tapError(Effect.logError)).pipe(Effect.map(f), Effect.mapError(() => new Failed()));
			const b = read.pipe(Effect.mapError(() => new Failed()), Effect.tapError(Effect.logError));`,
      errors: [missingCause('Effect.mapError', 'Failed')],
    },
  ],
});
