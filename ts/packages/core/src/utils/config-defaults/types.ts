import type { ComposioConfig } from '../../composio';
import type { BaseComposioProvider } from '../../provider/BaseProvider';

/**
 * Configuration defaults for Composio.
 * These are the required fields that must have default values.
 * The provider type is set to never since defaults don't include a provider instance.
 */
export type ConfigDefaults = Required<
  Pick<
    ComposioConfig<BaseComposioProvider<never, never, never>>,
    'autoUploadDownloadFiles' | 'allowTracking' | 'toolkitVersions'
  >
>;
