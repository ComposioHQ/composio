import z from 'zod/v3';
import { DEFAULT_TOOL_ROUTER_SESSION_FILES_MOUNT_ID } from '../utils/constants';

export const ToolRouterSessionFilesMountListOptionsSchema = z.object({
  path: z.string().optional(),
  mountId: z.string().default(DEFAULT_TOOL_ROUTER_SESSION_FILES_MOUNT_ID),
  /** Pagination cursor from the previous response nextCursor field */
  cursor: z.string().optional(),
  /** Maximum number of files to return per page (1-500) */
  limit: z.number().min(1).max(500).optional(),
});

export type ToolRouterSessionFilesMountListOptions = z.input<
  typeof ToolRouterSessionFilesMountListOptionsSchema
>;

const FileListItemSchema = z.object({
  last_modified: z.string(),
  mount_relative_path: z.string(),
  sandbox_mount_prefix: z.string(),
  size: z.number(),
});

export const FileListResponseSchema = z
  .object({
    items: z.array(FileListItemSchema),
    next_cursor: z.string().optional(),
  })
  .transform(data => ({
    items: data.items.map(item => ({
      lastModified: item.last_modified,
      mountRelativePath: item.mount_relative_path,
      sandboxMountPrefix: item.sandbox_mount_prefix,
      size: item.size,
    })),
    nextCursor: data.next_cursor,
  }));

export type FileListResponse = z.infer<typeof FileListResponseSchema>;

export const ToolRouterSessionFilesMountUploadOptionsSchema = z.object({
  /** Remote path/filename on the mount. When passing a buffer, either mimetype or remotePath is required. */
  remotePath: z.string().optional(),
  mountId: z.string().default(DEFAULT_TOOL_ROUTER_SESSION_FILES_MOUNT_ID),
  /** MIME type. When passing a buffer, either mimetype or remotePath is required. Ignored when passing File (uses file.type). */
  mimetype: z.string().optional(),
});

export type ToolRouterSessionFilesMountUploadOptions = z.input<
  typeof ToolRouterSessionFilesMountUploadOptionsSchema
>;

export const ToolRouterSessionFilesMountDownloadOptionsSchema = z.object({
  mountId: z.string().default(DEFAULT_TOOL_ROUTER_SESSION_FILES_MOUNT_ID),
});

export type ToolRouterSessionFilesMountDownloadOptions = z.input<
  typeof ToolRouterSessionFilesMountDownloadOptionsSchema
>;

export const ToolRouterSessionFilesMountDeleteOptionsSchema = z.object({
  mountId: z.string().default(DEFAULT_TOOL_ROUTER_SESSION_FILES_MOUNT_ID),
});

export type ToolRouterSessionFilesMountDeleteOptions = z.input<
  typeof ToolRouterSessionFilesMountDeleteOptionsSchema
>;

export const RemoteFileDataSchema = z
  .object({
    expires_at: z.string(),
    mount_relative_path: z.string(),
    sandbox_mount_prefix: z.string(),
    download_url: z.string(),
  })
  .transform(data => ({
    expiresAt: data.expires_at,
    mountRelativePath: data.mount_relative_path,
    sandboxMountPrefix: data.sandbox_mount_prefix,
    downloadUrl: data.download_url,
  }));

/** Parsed shape from API response. Use with `new RemoteFile(data)`. */
export type RemoteFileData = z.infer<typeof RemoteFileDataSchema>;

export const FileDeleteResponseSchema = z
  .object({
    mount_relative_path: z.string(),
    sandbox_mount_prefix: z.string(),
  })
  .transform(data => ({
    mountRelativePath: data.mount_relative_path,
    sandboxMountPrefix: data.sandbox_mount_prefix,
  }));

export type FileDeleteResponse = z.infer<typeof FileDeleteResponseSchema>;
