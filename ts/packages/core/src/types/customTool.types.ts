import { z } from 'zod/v3';
import { Tool, ToolProxyParams, ToolExecuteResponse as SdkToolExecuteResponse } from './tool.types';
import type { SessionProxyExecuteParams, ToolRouterSessionProxyExecuteResponse } from './toolRouter.types';
import { ToolExecuteResponse } from '@composio/client/resources/tools';
import { ConnectionData } from './connectedAccountAuthStates.types';
import type {
  SessionCreateParams,
  SessionCreateResponse,
} from '@composio/client/resources/tool-router/session/session.mjs';

// ────────────────────────────────────────────────────────────────
// Legacy custom tool types (used by composio.tools.createCustomTool)
// ────────────────────────────────────────────────────────────────

type BaseCustomToolOptions<T extends z.ZodType> = {
  name: string;
  description?: string;
  slug: string;
  inputParams: T;
};

type ToolkitBasedExecute<T extends z.ZodType> = {
  execute: (
    input: z.infer<T>,
    connectionConfig: ConnectionData | null,
    executeToolRequest: (data: ToolProxyParams) => Promise<ToolExecuteResponse>
  ) => Promise<ToolExecuteResponse>;
  toolkitSlug: string;
};

type StandaloneExecute<T extends z.ZodType> = {
  execute: (input: z.infer<T>) => Promise<ToolExecuteResponse>;
  toolkitSlug?: never;
};

export type CustomToolOptions<T extends z.ZodType> = BaseCustomToolOptions<T> &
  (ToolkitBasedExecute<T> | StandaloneExecute<T>);

export type CustomToolRegistry = Map<
  string,
  { options: CustomToolOptions<CustomToolInputParameter>; schema: Tool }
>;

export type InputParamsSchema = {
  definitions: {
    input: {
      type: string;
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
};

export type CustomToolInputParameter = z.ZodType;

export interface CustomToolRegistryItem {
  options: CustomToolOptions<CustomToolInputParameter>;
  schema: Tool;
}

export interface ExecuteMetadata {
  userId: string;
  connectedAccountId?: string;
}

// ────────────────────────────────────────────────────────────────
// New custom tool types (for tool router integration via createCustomTool())
// ────────────────────────────────────────────────────────────────

/**
 * Session context injected into custom tool execute functions at runtime.
 * Provides identity context and methods to call other tools or proxy API requests.
 */
export interface SessionContext {
  /** The user ID for this session */
  readonly userId: string;
  /** Execute any Composio native tool from within a custom tool */
  execute(
    toolSlug: string,
    arguments_: Record<string, unknown>
  ): Promise<SdkToolExecuteResponse>;
  /** Proxy API calls through Composio's auth layer (resolved from session toolkit). */
  proxyExecute(params: SessionProxyExecuteParams): Promise<ToolRouterSessionProxyExecuteResponse>;
}

/**
 * Execute function for custom tools.
 * Just return the result data, or throw an error. The SDK wraps it internally.
 *
 * Supports two call patterns:
 * - `(input) => data` — for tools that don't need session context
 * - `(input, ctx) => data` — for tools that need to call other tools or proxy APIs
 */
export type CustomToolExecuteFn<T extends z.ZodType> = (
  input: z.infer<T>,
  ctx: SessionContext
) => Promise<Record<string, unknown>>;

/**
 * Zod schema for validating a custom tool slug.
 * Alphanumeric, underscores, and hyphens only. No `LOCAL_` or `COMPOSIO_` prefix.
 * Length is validated contextually (standalone vs extension vs toolkit) at creation time.
 */
export const CustomToolSlugSchema = z
  .string()
  .min(1, 'slug is required')
  .regex(
    /^[A-Za-z0-9_-]+$/,
    'slug must only contain alphanumeric characters, underscores, and hyphens'
  )
  .refine(s => !s.toUpperCase().startsWith('LOCAL_'), {
    message:
      'slug must not start with "LOCAL_" — this prefix is reserved for internal routing.',
  })
  .refine(s => !s.toUpperCase().startsWith('COMPOSIO_'), {
    message:
      'slug must not start with "COMPOSIO_" — this prefix is reserved for Composio meta tools.',
  });

/**
 * Zod schema for validating the string/scalar fields of createCustomTool() options.
 * Slug is validated separately as the first argument.
 * Used internally for validation — inputParams, outputParams, and execute are checked manually.
 */
export const CreateCustomToolBaseSchema = z.object({
  name: z.string().min(1, 'createCustomTool: name is required'),
  description: z.string().min(1, 'createCustomTool: description is required'),
  /**
   * Composio toolkit slug that this tool extends (inherits auth from).
   * Must be a valid Composio toolkit slug (e.g. `'gmail'`, `'github'`, `'meta_ads'`).
   * The backend validates this against the toolkit catalog.
   * Leave empty for tools that don't need any Composio-managed authentication.
   */
  extendsToolkit: z.string().optional(),
});

/** Options for creating a custom tool via `createCustomTool()`. */
export type CreateCustomToolParams<T extends z.ZodType> = z.infer<
  typeof CreateCustomToolBaseSchema
> & {
  /** Zod schema for input parameters */
  inputParams: T;
  /** Optional Zod schema for output parameters (sent to backend for documentation) */
  outputParams?: z.ZodType;
  /** The function that executes the tool */
  execute: CustomToolExecuteFn<T>;
};

/**
 * Custom tool definition returned from `createCustomTool()`.
 * Pass to `composio.create(userId, { experimental: { customTools: [...] } })` to bind to a session.
 */
export interface CustomTool {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  /**
   * Composio toolkit slug that this tool extends (inherits auth from).
   * Must be a valid Composio toolkit slug. Validated by the backend.
   * Undefined means the tool doesn't need any Composio-managed authentication.
   */
  readonly extendsToolkit?: string;
  readonly inputSchema: Record<string, unknown>;
  /** JSON Schema representation of the output (for backend documentation) */
  readonly outputSchema?: Record<string, unknown>;
  /** @internal Original Zod schema — used for runtime input validation (defaults, coercions, transforms) */
  readonly inputParams: z.ZodType;
  /** Direct reference to the execute function — useful for testing */
  readonly execute: CustomToolExecuteFn<z.ZodType>;
}

/** Serialized tool definition sent to backend for search indexing. Uses official client type. */
export type CustomToolDefinition = SessionCreateParams.Experimental.CustomTool;

// ────────────────────────────────────────────────────────────────
// Custom toolkit types
// ────────────────────────────────────────────────────────────────

/**
 * Zod schema for validating the string/scalar fields of createCustomToolkit() options.
 * Slug is validated separately as the first argument.
 */
export const CreateCustomToolkitBaseSchema = z.object({
  name: z.string().min(1, 'createCustomToolkit: name is required'),
  description: z.string().min(1, 'createCustomToolkit: description is required'),
});

/** Options for creating a custom toolkit via `createCustomToolkit()`. */
export type CreateCustomToolkitParams = z.infer<typeof CreateCustomToolkitBaseSchema> & {
  /** Tools to include in this toolkit. Must not have `extendsToolkit` set. */
  tools: CustomTool[];
};

/**
 * Custom toolkit definition returned from `createCustomToolkit()`.
 * Pass to `composio.create(userId, { experimental: { customToolkits: [...] } })`.
 */
export interface CustomToolkit {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly tools: readonly CustomTool[];
}

/** Serialized toolkit definition sent to backend. Uses official client type. */
export type CustomToolkitDefinition = SessionCreateParams.Experimental.CustomToolkit;

// ────────────────────────────────────────────────────────────────
// Internal routing types
// ────────────────────────────────────────────────────────────────

/** @internal Entry in the per-session custom tools routing map. */
export type CustomToolsMapEntry = {
  handle: CustomTool;
  /** @internal The final slug assigned by the prefixing rules (e.g. LOCAL_GREP, LOCAL_GMAIL_GET_EMAILS) */
  finalSlug: string;
  /** Resolved toolkit — from extendsToolkit, parent custom toolkit, or undefined for standalone */
  toolkit?: string;
};

/** @internal Lookup maps used by ToolRouterSession for routing custom tools. */
export type CustomToolsMap = {
  /** Lookup by final slug (e.g. LOCAL_GET_USER_CONTEXT) — used for agent execution path */
  byFinalSlug: Map<string, CustomToolsMapEntry>;
  /** Lookup by original slug (e.g. GET_USER_CONTEXT) — used for programmatic session.execute() */
  byOriginalSlug: Map<string, CustomToolsMapEntry>;
  /** The original custom toolkits passed at session creation — used for session.customToolkits() */
  toolkits?: CustomToolkit[];
};

// ────────────────────────────────────────────────────────────────
// Registered custom tool types (returned by session.customTools())
// ────────────────────────────────────────────────────────────────

/** A custom tool as registered in a session, with its final resolved slug. */
export interface RegisteredCustomTool {
  /** The final slug as registered with the backend (e.g. LOCAL_GREP, LOCAL_GMAIL_GET_EMAILS) */
  slug: string;
  name: string;
  description: string;
  /** Resolved toolkit — extendsToolkit value, custom toolkit slug, or undefined for standalone */
  toolkit?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

/** A custom toolkit as registered in a session, with final slugs on nested tools. */
export interface RegisteredCustomToolkit {
  slug: string;
  name: string;
  description: string;
  tools: RegisteredCustomTool[];
}

// ────────────────────────────────────────────────────────────────
// Response types from the backend (slug + original_slug mapping)
// ────────────────────────────────────────────────────────────────

/** Custom tool as returned in the session create response (has prefixed slug + original_slug). */
export type CustomToolResponse = SessionCreateResponse.Experimental.CustomTool;

/** Custom toolkit as returned in the session create response (has prefixed slugs + original_slugs). */
export type CustomToolkitResponse = SessionCreateResponse.Experimental.CustomToolkit;
