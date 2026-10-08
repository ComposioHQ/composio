import { Effect } from 'effect';
import { UNPREFIXED_CONFIG } from 'src/effects/app-config';
import { loadHostConfig } from 'src/services/config';

export type MasterKind = 'claude' | 'codex' | 'user';

export type MasterSignals = {
  readonly codex: boolean;
  readonly claude: boolean;
};

export const detectMaster = (signals: MasterSignals): MasterKind => {
  if (signals.codex) {
    return 'codex';
  }
  if (signals.claude) {
    return 'claude';
  }
  return 'user';
};

export const detectMasterFromHost: Effect.Effect<MasterKind> = loadHostConfig(
  UNPREFIXED_CONFIG.MASTER_SIGNALS
).pipe(Effect.map(detectMaster));
