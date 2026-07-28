export type MasterKind = 'claude' | 'codex' | 'user';

export const hasEnvPrefix = (env: Record<string, string | undefined>, prefix: string): boolean =>
  Object.keys(env).some(key => key.startsWith(prefix));

// eslint-disable-next-line eslint-js/no-restricted-syntax -- classifies the driving agent by scanning every env key for CODEX_/CLAUDE_ prefixes; effect/Config reads known keys and cannot enumerate the whole environment
export const detectMaster = (env: Record<string, string | undefined> = process.env): MasterKind => {
  if (hasEnvPrefix(env, 'CODEX_')) {
    return 'codex';
  }
  if (hasEnvPrefix(env, 'CLAUDE_')) {
    return 'claude';
  }
  return 'user';
};
