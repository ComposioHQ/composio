/**
 * @fileoverview `composio.experimental.usage`: project-scoped metering.
 * **Experimental — shape may change in future releases.**
 *
 * @module Usage
 */
import ComposioClient from '@composio/client';
import {
  UsageBreakdownParams,
  UsageBreakdownParamsSchema,
  UsageBreakdownResponse,
  UsageSummaryParams,
  UsageSummaryParamsSchema,
  UsageSummaryResponse,
} from '../types/usage.types';
import { ComposioRequestOptions } from '../types/requestOptions.types';
import { ValidationError } from '../errors/ValidationErrors';
import { telemetry } from '../telemetry/Telemetry';
import { withCancellation } from '../utils/cancellation';
import {
  transformUsageBreakdownParams,
  transformUsageBreakdownResponse,
  transformUsageSummaryParams,
  transformUsageSummaryResponse,
} from '../utils/transformers/usage';

/**
 * `composio.experimental.usage` — metering for the project the API key
 * belongs to. **Experimental — shape may change in future releases.**
 *
 * @example
 * ```typescript
 * const summary = await composio.experimental.usage.summary();
 * console.log(summary.entities.tool_calls?.totalQuantity);
 *
 * const byTool = await composio.experimental.usage.breakdown('tool_calls', {
 *   groupBy: 'tool_slug',
 *   limit: 10,
 * });
 * ```
 */
export class Usage {
  private client: ComposioClient;

  constructor(client: ComposioClient) {
    this.client = client;
    telemetry.instrument(this, 'Usage');
  }

  /**
   * Usage totals per metering entity type for a time range.
   * **Experimental — shape may change in future releases.**
   *
   * @param {UsageSummaryParams} [params] - Optional range, `entityTypes` and filters
   * @returns {Promise<UsageSummaryResponse>} Totals keyed by entity type
   * @throws {ValidationError} If the params fail validation
   *
   * @example
   * ```typescript
   * const summary = await composio.experimental.usage.summary({
   *   from: Date.now() - 7 * 24 * 60 * 60 * 1000,
   *   filters: { userId: ['user_123'] },
   * });
   * ```
   */
  async summary(
    params?: UsageSummaryParams,
    requestOptions?: ComposioRequestOptions
  ): Promise<UsageSummaryResponse> {
    const parsedParams = UsageSummaryParamsSchema.safeParse(params ?? {});
    if (!parsedParams.success) {
      throw new ValidationError('Failed to parse usage summary params', {
        cause: parsedParams.error,
      });
    }
    const body = transformUsageSummaryParams(parsedParams.data);
    const result = await withCancellation(
      () => this.client.project.usage.retrieveSummary(body, requestOptions),
      requestOptions?.signal
    );
    return transformUsageSummaryResponse(result);
  }

  /**
   * Usage for one metering entity type, grouped by a dimension.
   * **Experimental — shape may change in future releases.**
   *
   * @param {string} entityType - Entity type to break down (e.g. `tool_calls`, `sessions`)
   * @param {UsageBreakdownParams} [params] - Optional range, `groupBy`, ordering, `limit` and filters
   * @returns {Promise<UsageBreakdownResponse>} Totals plus per-group rows
   * @throws {ValidationError} If the params fail validation
   *
   * @example
   * ```typescript
   * const byUser = await composio.experimental.usage.breakdown('sessions', {
   *   groupBy: 'user_id',
   *   orderBy: 'event_count',
   * });
   * ```
   */
  async breakdown(
    entityType: string,
    params?: UsageBreakdownParams,
    requestOptions?: ComposioRequestOptions
  ): Promise<UsageBreakdownResponse> {
    const parsedParams = UsageBreakdownParamsSchema.safeParse(params ?? {});
    if (!parsedParams.success) {
      throw new ValidationError('Failed to parse usage breakdown params', {
        cause: parsedParams.error,
      });
    }
    const body = transformUsageBreakdownParams(parsedParams.data);
    const result = await withCancellation(
      () => this.client.project.usage.retrieve(entityType, body, requestOptions),
      requestOptions?.signal
    );
    return transformUsageBreakdownResponse(result);
  }
}
