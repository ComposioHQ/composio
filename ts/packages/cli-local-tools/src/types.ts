import type { z } from 'zod/v3';

export type LocalCliPlatform =
  | 'all'
  | 'darwin'
  | 'linux'
  | 'win32'
  | 'darwin-arm64'
  | 'darwin-x64'
  | 'linux-arm64'
  | 'linux-x64'
  | 'win32-arm64'
  | 'win32-x64';

export type LocalExecutionResult = Record<string, unknown>;

export interface LocalExecutionContext {
  readonly toolkit: LocalToolkitDeclaration;
  readonly tool: LocalToolDeclaration;
  readonly finalSlug: string;
  readonly platform: LocalCliPlatform;
}

export interface LocalCommandInvocation {
  readonly command: string;
  readonly args?: ReadonlyArray<string>;
  readonly env?: Record<string, string | undefined>;
  readonly cwd?: string;
  readonly stdin?: string;
  readonly timeoutMs?: number;
}

export interface LocalCommandExecution {
  readonly kind: 'command';
  readonly command: string | ((input: Record<string, unknown>) => string | LocalCommandInvocation);
  readonly args?:
    | ReadonlyArray<string>
    | ((input: Record<string, unknown>) => ReadonlyArray<string>);
  readonly env?:
    | Record<string, string | undefined>
    | ((input: Record<string, unknown>) => Record<string, string | undefined>);
  readonly cwd?: string | ((input: Record<string, unknown>) => string | undefined);
  readonly stdin?: string | ((input: Record<string, unknown>) => string | undefined);
  readonly timeoutMs?: number;
  /** Parse stdout as JSON when possible. Defaults to false. */
  readonly parseJson?: boolean;
}

export interface LocalNativeExecution {
  readonly kind: 'native';
  readonly execute: (
    input: Record<string, unknown>,
    context: LocalExecutionContext
  ) => Promise<LocalExecutionResult> | LocalExecutionResult;
}

export interface LocalMcpServerSpec {
  readonly command: string;
  readonly args?: ReadonlyArray<string>;
  readonly env?: Record<string, string | undefined>;
  readonly cwd?: string;
}

export interface LocalMcpExecution {
  readonly kind: 'mcp';
  readonly server: LocalMcpServerSpec | ((input: Record<string, unknown>) => LocalMcpServerSpec);
  /** Tool name to call. If omitted, the wrapper returns `listTools()`. */
  readonly toolName?: string | ((input: Record<string, unknown>) => string | undefined);
  readonly arguments?:
    | Record<string, unknown>
    | ((input: Record<string, unknown>) => Record<string, unknown>);
}

export interface LocalFfiExecution {
  readonly kind: 'ffi';
  readonly library: string;
  readonly symbol: string;
  readonly abi?: string;
}

export type LocalToolExecution =
  | LocalCommandExecution
  | LocalNativeExecution
  | LocalMcpExecution
  | LocalFfiExecution;

export interface LocalToolDeclaration<TInput extends z.ZodTypeAny = z.ZodTypeAny> {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly inputParams: TInput;
  readonly outputParams?: z.ZodTypeAny;
  readonly platforms: ReadonlyArray<LocalCliPlatform>;
  readonly execution: LocalToolExecution;
  readonly tags?: ReadonlyArray<string>;
}

export interface LocalToolkitDeclaration {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly platforms: ReadonlyArray<LocalCliPlatform>;
  readonly tools: ReadonlyArray<LocalToolDeclaration>;
  readonly source?: {
    readonly type: 'cli' | 'mcp' | 'native' | 'ffi';
    readonly package?: string;
    readonly repository?: string;
    readonly command?: string;
  };
}

export interface LocalToolResolution {
  readonly toolkit: LocalToolkitDeclaration;
  readonly tool: LocalToolDeclaration;
  readonly finalSlug: string;
  readonly supported: boolean;
  readonly currentPlatform: LocalCliPlatform;
}

export type LocalToolRouterExperimentalPayload = {
  custom_toolkits?: Array<{
    slug: string;
    name: string;
    description: string;
    tools: Array<{
      slug: string;
      name: string;
      description: string;
      input_schema: Record<string, unknown>;
      output_schema?: Record<string, unknown>;
    }>;
  }>;
};
