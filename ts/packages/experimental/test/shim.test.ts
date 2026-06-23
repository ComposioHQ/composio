import { describe, expect, it } from 'vitest';
import { experimental_createWorkbenchHelperSource } from '../src';

describe('experimental_createWorkbenchHelperSource', () => {
  it('checks response status before parsing JSON', () => {
    const source = experimental_createWorkbenchHelperSource();

    expect(source.indexOf('if (!response.ok)')).toBeLessThan(source.indexOf('JSON.parse(text)'));
  });
});
