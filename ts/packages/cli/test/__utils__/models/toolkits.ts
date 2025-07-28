import { Arbitrary, FastCheck } from 'effect';
import { Toolkit } from 'src/models/toolkits';

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
