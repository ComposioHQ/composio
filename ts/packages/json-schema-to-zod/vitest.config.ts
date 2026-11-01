import { defineConfig } from 'vitest/config';

// Exclude e2e directories - they are separate packages with their own test commands
const exclude = ['**/node_modules/**', '**/dist/**', '**/test/e2e/**'];

/** Only the zod 3.25 project runs it: it asserts the `/v4` entry refuses that copy. */
const floorRejection = 'test/v4-floor.test.ts';
/** The `/v4` entry cannot load below the floor, so the suites that import it skip the zod 3.25 project. */
const v4Only = ['test/v4/**', 'test/types.test.ts'];
/** Pinned against the package's own zod copy; older releases render JSON Schema differently. */
const v4Snapshot = 'test/v4/corpus-snapshot.test.ts';

/** Routes every `zod/v3` and `zod/v4` import, in sources and tests alike, to one aliased copy. */
const zodCopy = (alias: string) => ({
  alias: [{ find: /^zod\/(v3|v4)(\/.*)?$/, replacement: `${alias}/$1$2` }],
});

export default defineConfig({
  test: {
    exclude,
    projects: [
      {
        extends: true,
        test: { name: 'zod-4.5', exclude: [...exclude, floorRejection] },
      },
      {
        extends: true,
        test: { name: 'zod-4.1.13', exclude: [...exclude, floorRejection, v4Snapshot] },
        resolve: zodCopy('zod-floor'),
      },
      {
        extends: true,
        test: { name: 'zod-3.25', exclude: [...exclude, ...v4Only] },
        resolve: zodCopy('zod-3-25'),
      },
    ],
  },
});
