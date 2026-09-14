import type { Tool } from '@composio/core';
import { expect, it, vi } from 'vitest';

// Lives in its own file: `vi.resetModules()` clears the module cache for every
// later dynamic import in the file, so this must not share one with suites that
// load eve's internals by path.
const DURABLE_TOOL_CALLBACKS = Symbol.for('eve:durable-dynamic-tool-callbacks');

const tool: Tool = {
  slug: 'GITHUB_CREATE_ISSUE',
  name: 'GITHUB_CREATE_ISSUE',
  inputParameters: { type: 'object', properties: {} },
} as unknown as Tool;

// Each fresh module graph mints its own process token, the way a restarted
// process would.
const bindingFromFreshModule = async (): Promise<string> => {
  vi.resetModules();
  const { EveProvider } = await import('../src/eve');
  const wrapped = new EveProvider().wrapTools([tool], vi.fn())[tool.slug];
  const callbacks = (
    wrapped as unknown as Record<symbol, { execute: { closure: { binding: string } } }>
  )[DURABLE_TOOL_CALLBACKS];
  return callbacks.execute.closure.binding;
};

it('never mints the same binding id in two processes', async () => {
  const first = await bindingFromFreshModule();
  const second = await bindingFromFreshModule();

  expect(first).not.toBe(second);
});
