/**
 * TypeSafe (Jev) Provider
 *
 * Jev is not an LLM and has no tool calling. It takes a state plus typed questions and
 * returns calibrated probabilities. This provider compiles Composio tools into questions,
 * asks Jev, and turns the answers into a tool call, a partial call, or an abstention.
 *
 * @packageDocumentation
 * @module providers/typesafe
 */
import {
  BaseNonAgenticProvider,
  type ExecuteToolFnOptions,
  type ExecuteToolModifiers,
  type Tool,
  type ToolCallExecutionTarget,
  type ToolCallSession,
  type ToolExecuteResponse,
  type beforeExecuteModifier,
} from '@composio/core';
import { z } from 'zod/v3';
import { confidenceGate, shortlistTools } from './companion';
import { compileTool, compileToolSet } from './compile';
import { DEFAULT_MODEL, assertSettings, createAsk, decide, type Ask } from './decide';
import {
  TypesafeAbstainedDecisionError,
  TypesafeConfirmationRequiredError,
  TypesafeDecisionSchema,
  TypesafeIncompleteDecisionError,
  TypesafeMalformedDecisionError,
  TypesafeMissingApiKeyError,
  type TypesafeClientLike,
  type TypesafeDecideOptions,
  type TypesafeDecision,
  type TypesafeExecuteInput,
  type TypesafeGateOptions,
  type TypesafeProviderOptions,
  type TypesafeRequestOptions,
  type TypesafeShortlist,
  type TypesafeShortlistOptions,
  type TypesafeState,
  type TypesafeToolQuestions,
  type TypesafeToolSet,
} from './types';

// Read through a schema so the package needs no Node typings and loads on any runtime.
const EnvironmentSchema = z.object({
  process: z.object({ env: z.object({ TYPESAFE_API_KEY: z.string().optional() }) }),
});

export * from './types';
export {
  DEFAULT_MODEL,
  DEFAULT_THRESHOLDS,
  DESTRUCTIVE_ROUTING_THRESHOLD,
  MAX_TOOLS,
  REQUEST_BUDGET_TOKENS,
} from './decide';

/**
 * TypeSafe (Jev) Provider for Composio SDK.
 *
 * @example
 * ```typescript
 * const provider = new TypesafeProvider();
 * const composio = new Composio({ provider });
 *
 * const toolSet = await composio.tools.get('user123', { tools: ['GITHUB_CREATE_AN_ISSUE'] });
 * const decision = await provider.decide(toolSet, 'open a ticket about the login bug');
 *
 * if (decision.kind === 'partial') {
 *   const result = await provider.execute('user123', decision, {
 *     arguments: { title: 'Login bug', owner: 'composio', repo: 'sdk' },
 *   });
 * }
 * ```
 */
export class TypesafeProvider extends BaseNonAgenticProvider<
  TypesafeToolSet,
  TypesafeToolQuestions
> {
  readonly name = 'typesafe';

  private readonly options: TypesafeProviderOptions;
  private client: Promise<TypesafeClientLike> | undefined;

  /**
   * Constructs offline and without an API key. The TypeSafe client is built on the
   * first `decide`. Key precedence is `client` > `apiKey` > `TYPESAFE_API_KEY`.
   */
  constructor(options: TypesafeProviderOptions = {}) {
    super();
    assertSettings(options);
    this.options = options;
  }

  /** Compiles a Composio tool into Jev questions. Synchronous and offline. */
  wrapTool(tool: Tool): TypesafeToolQuestions {
    return compileTool(tool);
  }

  /** Compiles a list of tools into a tool set. Throws on duplicate slugs. */
  wrapTools(tools: Tool[]): TypesafeToolSet {
    return compileToolSet(tools.map(tool => this.wrapTool(tool)));
  }

  /**
   * Returns exactly one of `call`, `partial`, or `abstain`.
   *
   * `confidence` is the score of the least certain judgement the call depends on. It is
   * not a calibrated probability that the whole call is correct. `abstain` means only
   * that the model judged so: API failures and malformed responses throw typed errors.
   */
  async decide(
    toolSet: TypesafeToolSet,
    state: TypesafeState,
    options: TypesafeDecideOptions = {}
  ): Promise<TypesafeDecision> {
    return decide(toolSet, state, this.options, options, onRequest => this.ask(options, onRequest));
  }

  /**
   * Runs a `call`, or a `partial` completed by caller arguments, through Composio.
   * Makes no request to TypeSafe and needs no tool set, so a stored decision can run later.
   */
  async execute(
    session: ToolCallSession,
    decision: TypesafeDecision,
    input?: TypesafeExecuteInput
  ): Promise<ToolExecuteResponse>;
  async execute(
    userId: string,
    decision: TypesafeDecision,
    input?: TypesafeExecuteInput,
    options?: ExecuteToolFnOptions,
    modifiers?: ExecuteToolModifiers
  ): Promise<ToolExecuteResponse>;
  async execute(
    executionTarget: ToolCallExecutionTarget,
    decision: TypesafeDecision,
    input?: TypesafeExecuteInput,
    options?: ExecuteToolFnOptions,
    modifiers?: ExecuteToolModifiers
  ): Promise<ToolExecuteResponse> {
    const parsed = TypesafeDecisionSchema.safeParse(decision);
    if (!parsed.success) throw new TypesafeMalformedDecisionError();
    if (parsed.data.kind === 'abstain') throw new TypesafeAbstainedDecisionError();
    this.assertToolCallExecutionOptions(executionTarget, options, modifiers);

    // Caller arguments win over Jev-bound values. Only `undefined` counts as missing.
    const callArguments = { ...parsed.data.arguments };
    for (const [name, value] of Object.entries(input?.arguments ?? {})) {
      if (value !== undefined) callArguments[name] = value;
    }
    const missing = (parsed.data.kind === 'partial' ? parsed.data.missing : []).filter(
      path => callArguments[path[0]] === undefined
    );
    if (missing.length > 0) throw new TypesafeIncompleteDecisionError(missing);

    // Either field demands confirmation, so clearing `requiresConfirmation` in storage does
    // not skip it. A stored `risk` is as editable: storage integrity is the caller's to keep.
    const needsConfirmation =
      parsed.data.risk === 'destructive' || parsed.data.requiresConfirmation;
    if (needsConfirmation && input?.confirm !== true) {
      throw new TypesafeConfirmationRequiredError();
    }

    return this.executeToolForTarget(
      executionTarget,
      parsed.data.tool,
      callArguments,
      options,
      modifiers
    );
  }

  /** Ranks raw tools against a state and returns the top `k`, for handoff to another provider. */
  async shortlistTools(
    tools: Tool[],
    state: TypesafeState,
    options: TypesafeShortlistOptions
  ): Promise<TypesafeShortlist> {
    return shortlistTools(tools, state, options.k, this.ask(options));
  }

  /**
   * Builds a `beforeExecute` modifier for direct execution that vetoes a tool call which
   * does not match the user's request. It checks consistency; it is not an authorization
   * check. Create one gate per agent run and reuse it across that run's retries.
   */
  confidenceGate(options: TypesafeGateOptions): beforeExecuteModifier {
    const { model, timeout } = options;
    return confidenceGate(
      options,
      this.ask(timeout === undefined ? { model } : { model, timeout })
    );
  }

  private ask(
    options: TypesafeRequestOptions & { model?: string },
    onRequest?: (requestId: string | undefined) => void
  ): Ask {
    return createAsk(
      () => this.getClient(),
      options.model ?? this.options.model ?? DEFAULT_MODEL,
      options,
      onRequest
    );
  }

  private getClient(): Promise<TypesafeClientLike> {
    this.client ??= this.buildClient().catch((error: unknown) => {
      this.client = undefined;
      throw error;
    });
    return this.client;
  }

  private async buildClient(): Promise<TypesafeClientLike> {
    if (this.options.client !== undefined) return this.options.client;
    const environment = EnvironmentSchema.safeParse(globalThis);
    const apiKey =
      this.options.apiKey ??
      (environment.success ? environment.data.process.env.TYPESAFE_API_KEY : undefined);
    if (apiKey === undefined || apiKey.length === 0) throw new TypesafeMissingApiKeyError();
    const { TypeSafeClient } = await import('@typesafe-ai/sdk');
    // The SDK's `debug` level prints request bodies, so `TYPESAFE_LOG_LEVEL` must not
    // enable it. Inject a `client` to log at another level.
    return new TypeSafeClient({ apiKey, logLevel: 'warn' });
  }
}
