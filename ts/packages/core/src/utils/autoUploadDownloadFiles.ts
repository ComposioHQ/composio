import type { ComposioConfig } from '../composio';
import type { BaseComposioProvider } from '../provider/BaseProvider';
import logger from './logger';

/**
 * Whether automatic file upload/download during tool execution is enabled.
 * True if either the explicit opt-in or the deprecated legacy flag is true.
 */
export function resolveAutoUploadDownloadFilesEnabled<
  TProvider extends BaseComposioProvider<unknown, unknown, unknown>,
>(config?: ComposioConfig<TProvider>): boolean {
  return (
    config?.dangerouslyAllowAutoUploadDownloadFiles === true ||
    config?.autoUploadDownloadFiles === true
  );
}

let legacyAutoUploadDownloadDeprecationLogged = false;

export function warnDeprecatedAutoUploadDownloadFiles(): void {
  if (legacyAutoUploadDownloadDeprecationLogged) {
    return;
  }
  legacyAutoUploadDownloadDeprecationLogged = true;
  logger.warn(
    '[Composio] `autoUploadDownloadFiles` is deprecated and will be removed in a future version. Use `dangerouslyAllowAutoUploadDownloadFiles: true` instead.'
  );
}
