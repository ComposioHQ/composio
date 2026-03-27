export type MasterKind = 'claude' | 'codex' | 'user';

const hasEnvPrefix = (env: Record<string, string | undefined>, prefix: string): boolean =>
  Object.keys(env).some(key => key.startsWith(prefix));

export const detectMaster = (env: Record<string, string | undefined> = process.env): MasterKind => {
  if (hasEnvPrefix(env, 'CODEX_')) {
    return 'codex';
  }
  if (hasEnvPrefix(env, 'CLAUDE_')) {
    return 'claude';
  }
  return 'user';
};
