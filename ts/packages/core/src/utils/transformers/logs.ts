import type {
  LogCreateToolExecutionParams as RawLogSearchParams,
  LogCreateToolExecutionResponse as RawLogSearchResponse,
  LogRetrieveToolExecutionResponse as RawToolExecutionLogDetail,
} from '@composio/client/resources/logs';
import {
  LogSearchParams,
  LogSearchResponse,
  LogSearchResponseSchema,
  ToolExecutionLog,
  ToolExecutionLogDetail,
  ToolExecutionLogDetailSchema,
  ToolExecutionLogSchema,
} from '../../types/logs.types';
import { transform } from '../transform';

export const transformLogSearchParams = (params: LogSearchParams): RawLogSearchParams => ({
  limit: params.limit,
  cursor: params.cursor,
  filters: params.filters,
  time_range: params.timeRange,
});

export const transformToolExecutionLog = (
  response: RawLogSearchResponse['logs'][number]
): ToolExecutionLog => {
  return transform(response)
    .with(ToolExecutionLogSchema)
    .using(response => ({
      id: response.id,
      timestamp: response.timestamp,
      type: response.type,
      status: response.status,
      level: response.level,
      message: response.message,
      metadata: response.metadata,
      metrics: response.metrics,
      parent: response.parent
        ? { logId: response.parent.log_id, toolSlug: response.parent.tool_slug }
        : null,
    }));
};

export const transformLogSearchResponse = (response: RawLogSearchResponse): LogSearchResponse => {
  return transform(response)
    .with(LogSearchResponseSchema)
    .using(response => ({
      logs: response.logs.map(transformToolExecutionLog),
      nextCursor: response.next_cursor,
    }));
};

export const transformToolExecutionLogDetail = (
  response: RawToolExecutionLogDetail
): ToolExecutionLogDetail => {
  return transform(response)
    .with(ToolExecutionLogDetailSchema)
    .using(response => ({
      id: response.id,
      timestamp: response.timestamp,
      type: response.type,
      status: response.status,
      level: response.level,
      message: response.message,
      metadata: response.metadata,
      metrics: response.metrics,
      parent: response.parent
        ? { logId: response.parent.log_id, toolSlug: response.parent.tool_slug }
        : null,
      timings: response.timings
        ? { startTime: response.timings.start_time, endTime: response.timings.end_time }
        : undefined,
      context: {
        sessionId: response.context.session_id,
        traceId: response.context.trace_id,
        requestId: response.context.request_id,
      },
      source: {
        host: response.source.host,
        framework: response.source.framework,
        language: response.source.language,
      },
      data: response.data,
    }));
};
