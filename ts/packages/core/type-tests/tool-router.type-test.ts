import type { Equal, Expect } from '@type-challenges/utils';
import type { Composio, ToolRouterConfig, ToolRouterSession } from '../src';

type ToolRouterModel = Composio['experimental']['toolRouter'];

type SessionResult = Awaited<ReturnType<ToolRouterModel['createSession']>>;
type SessionParams = Parameters<ToolRouterModel['createSession']>;

type IsAny<T> = 0 extends 1 & T ? true : false;

type _Param0Type = Expect<Equal<SessionParams[0], string>>;
type _Param1Type = Expect<Equal<SessionParams[1], ToolRouterConfig | undefined>>;

// Ensure the promise resolves to the public schema type and isn't `any`.
type _SessionMatchesSchema = Expect<Equal<SessionResult, ToolRouterSession>>;
type _SessionIsNotAny = Expect<Equal<IsAny<SessionResult>, false>>;

// Ensure the optional config parameter is typed correctly and not `any`.
type _ConfigIsNotAny = Expect<Equal<IsAny<SessionParams[1]>, false>>;

type ToolkitArray = ToolRouterConfig['toolkits'];
type ToolkitEntry = NonNullable<ToolkitArray>[number];

type _ToolkitArrayShape = Expect<
  Equal<
    ToolkitArray,
    Array<string | { toolkit: string; authConfigId?: string | undefined }> | undefined
  >
>;

type _ToolkitEntryShape = Expect<
  Equal<ToolkitEntry, string | { toolkit: string; authConfigId?: string | undefined }>
>;

// Flag also stays optional boolean

type _ManualFlagOptional = Expect<
  Equal<ToolRouterConfig['manuallyManageConnections'], boolean | undefined>
>;
