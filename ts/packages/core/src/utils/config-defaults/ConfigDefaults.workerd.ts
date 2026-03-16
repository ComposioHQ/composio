import type { ConfigDefaults } from './types';

export const CONFIG_DEFAULTS: ConfigDefaults = {
  /**
   * We don't support auto-uploading/download files in Cloudflare Workers yet.
   */
  autoUploadDownloadFiles: false,
  allowTracking: true,
  toolkitVersions: 'latest',
};
