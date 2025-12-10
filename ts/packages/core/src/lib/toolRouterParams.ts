import { SessionCreateParams } from '@composio/client/resources/tool-router.mjs';
import {
  ToolRouterConfigTools,
  ToolRouterConfigToolsSchema,
  ToolRouterToolsParam,
} from '../types/toolRouter.types';
import { ValidationError } from '../errors';

export const transformToolRouterToolsParams = (
  params?: Record<string, ToolRouterToolsParam | ToolRouterConfigTools> | undefined
):
  | Record<
      string,
      SessionCreateParams.Enabled | SessionCreateParams.Disabled | SessionCreateParams.Tags
    >
  | undefined => {
  if (!params) {
    return undefined;
  }

  if (typeof params === 'object') {
    const result = Object.keys(params).reduce(
      (acc, key) => {
        if (Array.isArray(params[key])) {
          acc[key] = { enabled: params[key] };
        } else if (typeof params[key] === 'object') {
          const parsedResult = ToolRouterConfigToolsSchema.safeParse(params[key]);
          if (parsedResult.success) {
            const data = parsedResult.data;
            if (Array.isArray(data)) {
              acc[key] = { enabled: data };
            } else if ('enabled' in data) {
              acc[key] = { enabled: data.enabled };
            } else if ('disabled' in data) {
              acc[key] = { disabled: data.disabled };
            } else if ('tags' in data) {
              acc[key] = { tags: data.tags };
            }
          } else {
            throw new ValidationError(parsedResult.error.message);
          }
        } else {
          acc[key] = { enabled: params[key] };
        }
        return acc;
      },
      {} as Record<
        string,
        SessionCreateParams.Enabled | SessionCreateParams.Disabled | SessionCreateParams.Tags
      >
    );
    return result;
  }
};
