import { Arbitrary, DateTime, FastCheck } from 'effect';
import { Toolkit } from 'src/models/toolkits';

/**
 * A fixed OAuth2 toolkit, for suites that must not inherit the randomized
 * fields of the arbitrary-based builders below — execution paths branch on
 * values like `no_auth` and `auth_schemes`.
 */
export const makeToolkitFixture = (slug: string, name: string = slug): Toolkit => ({
  name,
  slug,
  auth_schemes: ['OAUTH2'],
  composio_managed_auth_schemes: ['OAUTH2'],
  is_local_toolkit: false,
  no_auth: false,
  meta: {
    description: `${name} toolkit`,
    categories: [],
    created_at: DateTime.unsafeMake('2024-05-03T11:44:32.061Z'),
    updated_at: DateTime.unsafeMake('2024-05-03T11:44:32.061Z'),
    available_versions: [],
    tools_count: 0,
    triggers_count: 0,
  },
});

const ToolkitArbitary = Arbitrary.make(Toolkit);

/**
 * Creates multiple test toolkit instances by merging arbitrary generated toolkit data with the provided subset values.
 * Useful for generating test data that maintains consistent identifiers while having realistic randomized properties.
 */
export function makeTestToolkits(inputs: Array<Pick<Toolkit, 'name' | 'slug'>>) {
  const samples = FastCheck.sample(ToolkitArbitary, {
    numRuns: inputs.length,
  });

  const testToolkits = samples.map((sample, i) => ({ ...sample, ...inputs[i] }));
  return testToolkits;
}

/**
 * Creates a single test toolkit instance by merging arbitrary generated toolkit data with the provided subset values.
 * Useful for generating test data that maintains consistent identifiers while having realistic randomized properties.
 */
export function makeTestToolkit(input: Pick<Toolkit, 'name' | 'slug'>) {
  const samples = FastCheck.sample(ToolkitArbitary, { numRuns: 1 });

  const testToolkits = samples.map((sample, i) => ({ ...sample, ...input }));
  return testToolkits[0];
}
