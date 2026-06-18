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

export interface LocalBundledBinaryTarget {
  /** Platform selectors that can use this artifact. */
  readonly platforms: ReadonlyArray<LocalCliPlatform>;
  /** Path relative to the local-tools bundle root. */
  readonly path: string;
  /** Mark executable before running. Defaults to true for command binaries. */
  readonly executable?: boolean;
}

export interface LocalBundledBinaryDeclaration {
  /** Stable id used by command/FFI declarations, e.g. `peekaboo-cli`. */
  readonly id: string;
  readonly description?: string;
  readonly targets: ReadonlyArray<LocalBundledBinaryTarget>;
}

export interface LocalBundledBinaryRef {
  readonly bundledBinary: string;
  /** PATH command or absolute path to use when the bundled artifact is absent. */
  readonly fallbackCommand?: string;
}

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

export type LocalCommandValue =
  | string
  | LocalBundledBinaryRef
  | LocalCommandInvocation
  | (LocalCommandInvocation & LocalBundledBinaryRef);

export interface LocalCommandExecution {
  readonly kind: 'command';
  readonly command: LocalCommandValue | ((input: Record<string, unknown>) => LocalCommandValue);
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
  /** Optional prerequisite command used by `composio local-tools doctor` for native wrappers. */
  readonly readiness?: LocalCommandInvocation;
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

export type LocalFfiType =
  | 'char'
  | 'uchar'
  | 'i8'
  | 'u8'
  | 'i16'
  | 'u16'
  | 'i32'
  | 'u32'
  | 'i64'
  | 'u64'
  | 'f32'
  | 'f64'
  | 'bool'
  | 'ptr'
  | 'cstring'
  | 'void';

export interface LocalFfiSymbolDeclaration {
  readonly args: ReadonlyArray<LocalFfiType>;
  readonly returns: LocalFfiType;
}

export interface LocalFfiLibraryHandle {
  readonly path: string;
  readonly symbols: Record<string, (...args: ReadonlyArray<unknown>) => unknown>;
}

export interface LocalFfiExecution {
  readonly kind: 'ffi';
  /** Absolute library path or bundled binary reference for a .dylib/.so/.dll. */
  readonly library: string | LocalBundledBinaryRef;
  readonly symbols: Record<string, LocalFfiSymbolDeclaration>;
  readonly execute: (
    input: Record<string, unknown>,
    context: LocalExecutionContext,
    library: LocalFfiLibraryHandle
  ) => Promise<LocalExecutionResult> | LocalExecutionResult;
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
  readonly bundledBinaries?: ReadonlyArray<LocalBundledBinaryDeclaration>;
  readonly source?: {
    readonly type: 'cli' | 'mcp' | 'native' | 'ffi';
    readonly package?: string;
    readonly repository?: string;
    readonly command?: string;
  };
  readonly setup?: {
    readonly install?: string;
    readonly commandOverrides?: ReadonlyArray<string>;
    readonly notes?: ReadonlyArray<string>;
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
