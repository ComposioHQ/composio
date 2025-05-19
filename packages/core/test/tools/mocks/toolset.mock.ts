import { vi } from 'vitest';
import { BaseAgenticToolset } from '../../../src/toolset/BaseToolset';

export class MockToolset extends BaseAgenticToolset<unknown, unknown> {
  readonly name = 'MockToolset';

  wrapTool = vi.fn();
  wrapTools = vi.fn();
}
