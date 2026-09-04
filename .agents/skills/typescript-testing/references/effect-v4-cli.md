# Effect v4 CLI testing

Use this reference only for the Effect v4 migration. The current CLI suite runs on Effect v3 until the owning migration slice changes its exact package pins.

## Version and runner boundary

- Pin `effect` and `@effect/vitest` to the same exact v4 beta.
- Keep the CLI on the workspace Vitest 4 catalog entry; do not install a second runner version inside the package.
- Compile examples and migrated tests against installed packages. `ts/vendor/effect` may be ahead and is only a source oracle.
- Do not mix v3 and v4 Effect values, layers, or test helpers in one test graph.

## V4 test API changes

- Continue using `it.effect` for effects with test services and automatic Scope handling.
- Replace v3-only `it.scoped` with `it.effect`; replace `it.scopedLive` with `it.live`. Confirm APIs against `ts/vendor/effect/packages/vitest/src/` for the selected beta.
- Keep reusable fixtures under `layer(TestLayer)(it => { ... })` or `it.layer(...)`.
- Import `TestClock` and `FastCheck` from `effect/testing`, not the v3 core barrel.
- Prefer assertion functions from `@effect/vitest/utils`, such as `assertTrue`, `assertDefined`, and `assertInstanceOf`, when the assertion must narrow a value.
- Never guard assertions with `if`. A failed discriminant or instance check must fail the test, not skip its body.

```ts
import { assert, describe, it } from '@effect/vitest';
import { assertInstanceOf } from '@effect/vitest/utils';
import { Effect, Schema } from 'effect';

class MissingTool extends Schema.TaggedErrorClass<MissingTool>()('MissingTool', {
  slug: Schema.String,
}) {}

const findTool = Effect.fn('findTool')(function* (slug: string) {
  if (slug.length === 0) {
    return yield* new MissingTool({ slug });
  }
  return { slug };
});

describe('findTool', () => {
  it.effect('returns a tool', () =>
    Effect.gen(function* () {
      const tool = yield* findTool('github_create_issue');
      assert.strictEqual(tool.slug, 'github_create_issue');
    })
  );

  it.effect('exposes a typed failure', () =>
    findTool('').pipe(
      Effect.catchTag('MissingTool', error =>
        Effect.sync(() => {
          assertInstanceOf(error, MissingTool);
          assert.strictEqual(error.slug, '');
        })
      )
    )
  );
});
```

Compile this example with the migration probe:

```bash
node .agents/skills/effect-v4/scripts/check-examples.mjs .agents/skills/typescript-testing/references/effect-v4-cli.md
```

## CLI behavior matrix

Port tests by contract, not file count:

- root and subcommand help, version, built-ins, aliases, and flag collisions;
- required, optional, repeated, invalid, and dash-leading arguments, including `--`;
- stdout data versus stderr decoration in interactive and piped modes;
- framework errors versus Composio error rendering and exit-code mapping;
- shared service layers, config providers, filesystem/process adapters, interruption, time, and cleanup;
- direct binary smoke tests and Docker CLI E2E after unit and package checks pass.
