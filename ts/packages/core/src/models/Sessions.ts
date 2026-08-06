import type { Composio as ComposioClient } from '@composio/client';
import type { BaseComposioProvider } from '../provider/BaseProvider';
import type { ComposioConfig } from '../composio';
import { ToolRouter } from './ToolRouter';

/**
 * First-class API for creating and reusing Composio sessions.
 *
 * Use `composio.sessions.create(...)` to create a session and
 * `composio.sessions.use(...)` to reuse one.
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
