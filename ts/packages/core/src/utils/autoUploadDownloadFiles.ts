import type { ComposioConfig } from '../composio';
import type { BaseComposioProvider } from '../provider/BaseProvider';

/**
 * Whether automatic file upload/download during tool execution is enabled
 * (explicit opt-in via {@link ComposioConfig.dangerouslyAllowAutoUploadDownloadFiles}).
 */
export function resolveAutoUploadDownloadFilesEnabled<
  TProvider extends BaseComposioProvider<unknown, unknown, unknown>,
>(config?: ComposioConfig<TProvider>): boolean {
  return config?.dangerouslyAllowAutoUploadDownloadFiles === true;
}
