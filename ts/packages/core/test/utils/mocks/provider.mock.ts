import { vi } from 'vitest';
import { BaseAgenticProvider } from '../../../src/provider/BaseProvider';

export class MockProvider extends BaseAgenticProvider<unknown, unknown, unknown> {
  readonly name = 'MockProvider';
  readonly _isAgentic = true;

  wrapTool = vi.fn();
  wrapTools = vi.fn();
}
