/**
 * Type-level tests for the local tools rename. The deprecated `custom*` names
 * must stay interchangeable with the `local*` names so existing code compiles.
 */
import {
  Composio,
  experimental_createTool,
  experimental_createToolkit,
  type CustomTool,
  type CustomToolkit,
  type LocalTool,
  type LocalToolkit,
  type RegisteredCustomTool,
  type RegisteredCustomToolkit,
  type RegisteredLocalTool,
  type RegisteredLocalToolkit,
} from '../src';
import type {
  CreateCustomToolParams,
  CreateLocalToolParams,
  CustomTool as ExperimentalCustomTool,
  LocalTool as ExperimentalLocalTool,
} from '../src/experimental';
import type { z } from 'zod/v3';

declare const composio: Composio;
declare const localTool: ReturnType<typeof experimental_createTool>;
declare const localToolkit: ReturnType<typeof experimental_createToolkit>;
declare const legacyParams: CreateCustomToolParams<z.ZodTypeAny>;

async function localToolsAliases(): Promise<void> {
  const asLocal: LocalTool = localTool;
  const asCustom: CustomTool = asLocal;
  const backToLocal: ExperimentalLocalTool = asCustom satisfies ExperimentalCustomTool;
  const toolkit: LocalToolkit = localToolkit satisfies CustomToolkit;
  void backToLocal;

  const params: CreateLocalToolParams<z.ZodTypeAny> = legacyParams;
  void params;

  const session = await composio.create('u', {
    experimental: { localTools: [asCustom], localToolkits: [toolkit] },
  });
  const tools: RegisteredLocalTool[] = session.customTools();
  const legacyTools: RegisteredCustomTool[] = session.localTools({ toolkit: 'DEV_TOOLS' });
  const toolkits: RegisteredLocalToolkit[] = session.customToolkits();
  const legacyToolkits: RegisteredCustomToolkit[] = session.localToolkits();
  void [tools, legacyTools, toolkits, legacyToolkits];

  await composio.sessions.use('session_123', { localTools: [asLocal], localToolkits: [toolkit] });
  await composio.use('session_123', {
    customTools: [asLocal],
    customToolkits: [toolkit],
    mcp: true,
  });
}
void localToolsAliases;
