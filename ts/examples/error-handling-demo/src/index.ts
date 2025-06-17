import { Composio } from '@composio/core';
import { ComposioError } from '@composio/core';

async function level3() {
  throw new ComposioError('Level 3 error', {
    code: 'LEVEL_3_ERROR',
    cause: new Error('Original cause'),
  });
}

async function level2() {
  try {
    await level3();
  } catch (error) {
    throw new ComposioError('Level 2 error', {
      code: 'LEVEL_2_ERROR',
      cause: error,
    });
  }
}

async function level1() {
  try {
    await level2();
  } catch (error) {
    throw new ComposioError('Level 1 error', {
      code: 'LEVEL_1_ERROR',
      cause: error,
    });
  }
}

async function main() {
  try {
    const composio = new Composio({
      apiKey: 'test-api-key',
    });

    await level1();
  } catch (error) {
    if (error instanceof ComposioError) {
      error.prettyPrint(true);
      
      console.log('\n\nRaw stack trace:');
      console.log(error.stack);
    } else {
      console.error('Unexpected error:', error);
    }
  }
}

main().catch(console.error);
