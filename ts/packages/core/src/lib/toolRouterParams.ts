import { SessionCreateParams } from '@composio/client/resources/tool-router.mjs';
import { ToolRouterConfigTools } from '../types/toolRouter.types';

export const transformToolRouterToolsParams = (
  params?: ToolRouterConfigTools | undefined
): SessionCreateParams.Tools | undefined => {
  if (!params) {
    return undefined;
  }

  const { overrides, tags } = params;

  const toolOverrides = overrides
    ? Object.keys(overrides).reduce(
        (acc, key) => {
          const override = overrides[key];
          if (Array.isArray(override)) {
            acc[key] = { enabled: override };
          } else if (override !== undefined) {
            if ('enabled' in override && override.enabled) {
              acc[key] = { enabled: override.enabled };
            } else if ('disabled' in override && override.disabled) {
              acc[key] = { disabled: override.disabled };
            }
          }
          return acc;
        },
        {} as Record<string, SessionCreateParams.Tools.Enabled | SessionCreateParams.Tools.Disabled>
      )
    : undefined;

  const tagFilters = tags
    ? (() => {
        if (Array.isArray(tags)) {
          return { include: tags };
        } else if ('enabled' in tags && tags.enabled) {
          return { include: tags.enabled };
        } else if ('disabled' in tags && tags.disabled) {
          return { exclude: tags.disabled };
        }
        return undefined;
      })()
    : undefined;

  return {
    overrides: toolOverrides,
    filters: tagFilters
      ? {
          tags: tagFilters,
        }
      : undefined,
  };
};
