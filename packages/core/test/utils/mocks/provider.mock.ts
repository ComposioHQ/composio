import { vi } from 'vitest';
import { BaseAgenticProvider } from '../../../src/provider/BaseProvider';

export class MockProvider extends BaseAgenticProvider<unknown, unknown> {
  readonly name = 'MockProvider';

  wrapTool = vi.fn();
  wrapTools = vi.fn();
}
