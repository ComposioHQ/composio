import type {
  UsageRetrieveParams as RawUsageBreakdownParams,
  UsageRetrieveResponse as RawUsageBreakdownResponse,
  UsageRetrieveSummaryParams as RawUsageSummaryParams,
  UsageRetrieveSummaryResponse as RawUsageSummaryResponse,
} from '@composio/client/resources/project/usage';
import {
  UsageBreakdownParams,
  UsageBreakdownResponse,
  UsageBreakdownResponseSchema,
  UsageFilters,
  UsageSummaryParams,
  UsageSummaryResponse,
  UsageSummaryResponseSchema,
} from '../../types/usage.types';
import { transform } from '../transform';

const transformUsageFilters = (
  filters: UsageFilters | undefined
): RawUsageSummaryParams['filters'] =>
  filters ? { user_id: filters.userId, session_id: filters.sessionId } : undefined;

export const transformUsageSummaryParams = (params: UsageSummaryParams): RawUsageSummaryParams => ({
  from: params.from,
  to: params.to,
  entity_types: params.entityTypes,
  filters: transformUsageFilters(params.filters),
});

export const transformUsageBreakdownParams = (
  params: UsageBreakdownParams
): RawUsageBreakdownParams => ({
  from: params.from,
  to: params.to,
  group_by: params.groupBy,
  order_by: params.orderBy,
  order_direction: params.orderDirection,
  limit: params.limit,
  filters: transformUsageFilters(params.filters),
});

export const transformUsageSummaryResponse = (
  response: RawUsageSummaryResponse
): UsageSummaryResponse => {
  return transform(response)
    .with(UsageSummaryResponseSchema)
    .using(response => ({
      entities: Object.fromEntries(
        Object.entries(response.entities).map(([entityType, entity]) => [
          entityType,
          {
            unit: entity.unit,
            totalQuantity: entity.total_quantity,
            eventCount: entity.event_count,
          },
        ])
      ),
    }));
};

export const transformUsageBreakdownResponse = (
  response: RawUsageBreakdownResponse
): UsageBreakdownResponse => {
  return transform(response)
    .with(UsageBreakdownResponseSchema)
    .using(response => ({
      entityType: response.entity_type,
      unit: response.unit,
      totalQuantity: response.total_quantity,
      eventCount: response.event_count,
      groups: response.groups.map(group => ({
        key: group.key,
        totalQuantity: group.total_quantity,
        eventCount: group.event_count,
      })),
    }));
};
