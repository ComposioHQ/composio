/**
 * Experimental local workbench helpers, exposed on the
 * `@composio/experimental/workbench` subpath. **Experimental — shape may change
 * in future releases.**
 *
 * These helpers let you run a Composio Tool Router session in a sandbox you own
 * (your filesystem, your shell, your security boundary) instead of Composio's
 * hosted remote sandbox. `experimental_createLocalWorkbenchSession` returns a
 * Python `helperSource` (exposing `run_composio_tool`, `invoke_llm`,
 * `web_search`, `proxy_execute`) plus the `env` that helper needs to reach
 * Composio from inside your box. Import them from this subpath:
 *   `import { experimental_createLocalWorkbenchSession } from '@composio/experimental/workbench';`
 *
 * @packageDocumentation
 * @module experimental/workbench
 */
export { experimental_createLocalWorkbenchSession } from './local-workbench';
export {
  experimental_createPythonWorkbenchHelperSource,
  experimental_createWorkbenchEnv,
} from './shim';
export type { PythonWorkbenchHelperSourceOptions, WorkbenchEnvOptions } from './shim';
export type { LocalWorkbenchSession } from './types';
