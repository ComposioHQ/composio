import { Effect } from 'effect';
import { DEBUG_CONFIG } from 'src/config';
import * as constants from 'src/constants';
import { resolveRunningCliVersion } from 'src/services/run-companion-modules';

export const getVersion = Effect.flatMap(DEBUG_CONFIG.VERSION, version =>
  version === undefined
    ? resolveRunningCliVersion(process.execPath, constants.APP_VERSION)
    : Effect.succeed(version)
);
