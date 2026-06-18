import type { ConfigDefaults } from './types';

export const CONFIG_DEFAULTS: ConfigDefaults = {
  /**
   * We don't support auto-uploading/download files in Cloudflare Workers yet.
   */
  dangerouslyAllowAutoUploadDownloadFiles: false,
  allowTracking: true,
  toolkitVersions: 'latest',
};
