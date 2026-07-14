import type { Composio as ComposioClient } from '@composio/client';
import type { BaseComposioProvider } from '../provider/BaseProvider';
import type { ComposioConfig } from '../composio';
import { ToolRouter } from './ToolRouter';

/**
 * First-class API for creating and reusing Composio sessions.
 *
 * `composio.sessions.create(...)` is the canonical session creation entrypoint.
 * The top-level `composio.create(...)` method remains as a backwards-compatible
 * alias for `composio.sessions.create(...)`.
 */
export class Sessions<
  TToolCollection,
  TTool,
  TProvider extends BaseComposioProvider<TToolCollection, TTool, unknown>,
> extends ToolRouter<TToolCollection, TTool, TProvider> {
  constructor(client: ComposioClient, config?: ComposioConfig<TProvider>) {
    super(client, config);
  }
}
