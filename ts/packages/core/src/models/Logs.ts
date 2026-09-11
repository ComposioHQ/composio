/**
 * @fileoverview The `composio.logs` namespace: search and inspect
 * tool-execution logs for the project.
 *
 * @module Logs
 */
import ComposioClient from '@composio/client';
import {
  LogSearchParams,
  LogSearchParamsSchema,
  LogSearchResponse,
  ToolExecutionLogDetail,
} from '../types/logs.types';
import { ComposioRequestOptions } from '../types/requestOptions.types';
import { ValidationError } from '../errors/ValidationErrors';
import { telemetry } from '../telemetry/Telemetry';
import { withCancellation } from '../utils/cancellation';
import {
  transformLogSearchParams,
  transformLogSearchResponse,
  transformToolExecutionLogDetail,
} from '../utils/transformers/logs';

/**
 * `composio.logs` — tool-execution logs.
 *
 * @example
 * ```typescript
 * const { logs, nextCursor } = await composio.logs.search({
 *   filters: [{ field: 'toolkit_slug', operator: '==', value: 'github' }],
 *   limit: 20,
 * });
 * const detail = await composio.logs.get(logs[0].id);
 * ```
 */
export class Logs {
  private client: ComposioClient;

  constructor(client: ComposioClient) {
    this.client = client;
    telemetry.instrument(this, 'Logs');
  }

  /**
   * Search tool-execution logs with filters, a time range and cursor
   * pagination.
   *
   * @param {LogSearchParams} [params] - Filters, `timeRange`, `limit` and `cursor`
   * @returns {Promise<LogSearchResponse>} Matching logs and the next cursor
   * @throws {ValidationError} If the params fail validation
   *
   * @example
   * ```typescript
   * const { logs } = await composio.logs.search({
   *   filters: [
   *     { field: 'status', operator: '==', value: 'failed' },
   *     { field: 'user_id', operator: '==', value: 'user_123' },
   *   ],
   *   timeRange: { from: Date.now() - 24 * 60 * 60 * 1000, to: Date.now() },
   * });
   * ```
   */
  async search(
    params?: LogSearchParams,
    requestOptions?: ComposioRequestOptions
  ): Promise<LogSearchResponse> {
    const parsedParams = LogSearchParamsSchema.safeParse(params ?? {});
    if (!parsedParams.success) {
      throw new ValidationError('Failed to parse log search params', {
        cause: parsedParams.error,
      });
    }
    const body = transformLogSearchParams(parsedParams.data);
    const result = await withCancellation(
      () => this.client.logs.createToolExecution(body, requestOptions),
      requestOptions?.signal
    );
    return transformLogSearchResponse(result);
  }

  /**
   * Retrieve one tool-execution log with its full detail (timings, context,
   * source and raw `data`).
   *
   * @param {string} id - The log id
   * @returns {Promise<ToolExecutionLogDetail>} The log detail
   *
   * @example
   * ```typescript
   * const log = await composio.logs.get('log_abc123');
   * console.log(log.status, log.timings?.endTime);
   * ```
   */
  async get(id: string, requestOptions?: ComposioRequestOptions): Promise<ToolExecutionLogDetail> {
    const result = await withCancellation(
      () => this.client.logs.retrieveToolExecution(id, requestOptions),
      requestOptions?.signal
    );
    return transformToolExecutionLogDetail(result);
  }
}
