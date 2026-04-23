/**
 * Runtime features a skill can declare in its frontmatter. Capabilities are
 * hard compatibility gates — if a target platform does not support one, the
 * build fails rather than polyfilling.
 */
export const CAPABILITIES = ['listen', 'workbench', 'proxy', 'multi_account', 'subAgents'] as const;

export type Capability = (typeof CAPABILITIES)[number];

export const isCapability = (value: string): value is Capability =>
  (CAPABILITIES as readonly string[]).includes(value);
