export type MasterKind = 'claude' | 'codex' | 'user';

const hasEnvPrefix = (env: NodeJS.ProcessEnv, prefix: string): boolean =>
  Object.keys(env).some(key => key.startsWith(prefix));

export const detectMaster = (env: NodeJS.ProcessEnv = process.env): MasterKind => {
  if (hasEnvPrefix(env, 'CODEX_')) {
    return 'codex';
  }
  if (hasEnvPrefix(env, 'CLAUDE_')) {
    return 'claude';
  }
  return 'user';
};
