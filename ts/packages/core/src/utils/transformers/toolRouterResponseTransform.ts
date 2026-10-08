/**
 * Transforms snake_case Tool Router API responses to camelCase for SDK consumers.
 */
import type {
  SessionExecuteResponse,
  SessionProxyExecuteResponse,
} from '@composio/client/resources/tool-router/session/session.mjs';
import z from 'zod/v3';
import { ComposioToolInputRequiredError } from '../../errors/ToolRouterErrors';
import { ValidationError } from '../../errors/ValidationErrors';
import type { ToolRouterSessionExecuteResponse } from '../../types/toolRouter.types';

/** The `result_type` values of a call that ran. `input_required` is raised before this is read. */
const ExecutedResponseSchema = z.object({ result_type: z.enum(['completed', 'failed']) });

/**
 * Whether a session tool execution succeeded. `resultType` decides: a `failed`
 * execution is not successful even when its `error` is `null` or empty.
 */
export function isExecutionSuccessful(
  result: Pick<ToolRouterSessionExecuteResponse, 'resultType'>
): boolean {
  return result.resultType === 'completed';
}

type InputRequiredResponse = Extract<
  SessionExecuteResponse | SessionProxyExecuteResponse,
  { result_type: 'input_required' }
>;

/**
 * Narrows an execute-family response to the variants that carry a result.
 * `input_required` means the call did not run: it is raised as a
 * {@link ComposioToolInputRequiredError} instead of being returned as a result
 * it is not.
 */
export function assertNotInputRequired<
  Response extends SessionExecuteResponse | SessionProxyExecuteResponse,
>(raw: Response, subject: string): asserts raw is Exclude<Response, InputRequiredResponse> {
  if (raw.result_type !== 'input_required') return;
  throw new ComposioToolInputRequiredError(subject, {
    inputRequests: Object.fromEntries(
      Object.entries(raw.input_requests).map(([id, request]) => [
        id,
        {
          type: request.type,
          mode: request.mode,
          message: request.message,
          requestedSchema: request.requested_schema,
        },
      ])
    ),
    requestState: raw.request_state,
  });
}

interface RawSearchResult {
  index: number;
  use_case: string;
  primary_tool_slugs: string[];
  related_tool_slugs: string[];
  toolkits: string[];
  difficulty?: string;
  error?: string | null;
  execution_guidance?: string;
  known_pitfalls?: string[];
  memory?: Record<string, string[]>;
  plan_id?: string;
  recommended_plan_steps?: string[];
  reference_workbench_snippets?: Array<{ code: string; description: string }>;
}

interface RawSearchSession {
  id: string;
  generate_id: boolean;
  instructions: string;
}

interface RawSearchTimeInfo {
  current_time_utc: string;
  current_time_utc_epoch_seconds: number;
  message: string;
}

interface RawToolSchema {
  tool_slug: string;
  toolkit: string;
  description?: string;
  hasFullSchema?: boolean;
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  schemaRef?: {
    args: { tool_slugs: string[] };
    message?: string;
    tool: string;
  };
}

interface RawToolkitConnectionStatus {
  toolkit: string;
  description: string;
  has_active_connection: boolean;
  status_message: string;
  connection_details?: Record<string, unknown>;
  current_user_info?: Record<string, unknown>;
  instant_account?: { allowed_tool_slugs: string[] };
}

interface RawSearchResponse {
  success: boolean;
  error: string | null;
  results: RawSearchResult[];
  tool_schemas: Record<string, RawToolSchema>;
  toolkit_connection_statuses: RawToolkitConnectionStatus[];
  next_steps_guidance: string[];
  session: RawSearchSession;
  time_info: RawSearchTimeInfo;
}

function transformSearchResult(raw: RawSearchResult) {
  return {
    index: raw.index,
    useCase: raw.use_case,
    primaryToolSlugs: raw.primary_tool_slugs,
    relatedToolSlugs: raw.related_tool_slugs,
    toolkits: raw.toolkits,
    difficulty: raw.difficulty,
    error: raw.error,
    executionGuidance: raw.execution_guidance,
    knownPitfalls: raw.known_pitfalls,
    memory: raw.memory,
    planId: raw.plan_id,
    recommendedPlanSteps: raw.recommended_plan_steps,
    referenceWorkbenchSnippets: raw.reference_workbench_snippets,
  };
}

function transformToolSchema(raw: RawToolSchema) {
  return {
    toolSlug: raw.tool_slug,
    toolkit: raw.toolkit,
    description: raw.description,
    hasFullSchema: raw.hasFullSchema,
    inputSchema: raw.input_schema,
    outputSchema: raw.output_schema,
    schemaRef: raw.schemaRef
      ? {
          args: { toolSlugs: raw.schemaRef.args.tool_slugs },
          message: raw.schemaRef.message,
          tool: raw.schemaRef.tool,
        }
      : undefined,
  };
}

function transformToolkitConnectionStatus(raw: RawToolkitConnectionStatus) {
  return {
    toolkit: raw.toolkit,
    description: raw.description,
    hasActiveConnection: raw.has_active_connection,
    statusMessage: raw.status_message,
    connectionDetails: raw.connection_details,
    currentUserInfo: raw.current_user_info,
    ...(raw.instant_account !== undefined && {
      instantAccount: { allowedToolSlugs: raw.instant_account.allowed_tool_slugs },
    }),
  };
}

/**
 * Transforms a raw session search API response to camelCase.
 */
export function transformSearchResponse(raw: RawSearchResponse) {
  const toolSchemas: Record<string, ReturnType<typeof transformToolSchema>> = {};
  for (const [slug, schema] of Object.entries(raw.tool_schemas)) {
    toolSchemas[slug] = transformToolSchema(schema);
  }

  return {
    success: raw.success,
    error: raw.error,
    results: raw.results.map(transformSearchResult),
    toolSchemas,
    toolkitConnectionStatuses: raw.toolkit_connection_statuses.map(
      transformToolkitConnectionStatus
    ),
    nextStepsGuidance: raw.next_steps_guidance,
    session: {
      id: raw.session.id,
      generateId: raw.session.generate_id,
      instructions: raw.session.instructions,
    },
    timeInfo: {
      currentTimeUtc: raw.time_info.current_time_utc,
      currentTimeUtcEpochSeconds: raw.time_info.current_time_utc_epoch_seconds,
      message: raw.time_info.message,
    },
  };
}

/**
 * Transforms a raw session execute API response to camelCase.
 *
 * @throws {ComposioToolInputRequiredError} If the tool asked for user input instead of running
 * @throws {ValidationError} If the response carries no `result_type`, or one this SDK does not know
 */
export function transformExecuteResponse(raw: SessionExecuteResponse, toolSlug: string) {
  assertNotInputRequired(raw, `Tool ${toolSlug}`);
  const executed = ExecutedResponseSchema.safeParse(raw);
  if (!executed.success) {
    throw new ValidationError(
      `Tool ${toolSlug} returned an execute response without a known result_type`,
      { cause: executed.error }
    );
  }
  return {
    data: raw.data,
    error: raw.error,
    logId: raw.log_id,
    resultType: executed.data.result_type,
    ...(raw.instant_charge !== undefined && { instantCharge: raw.instant_charge }),
  };
}
