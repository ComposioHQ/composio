import { Effect, Option } from 'effect';
import { DEBUG_OVERRIDE_CONFIG } from 'src/effects/debug-config';
import * as constants from 'src/constants';
import { resolveRunningCliVersion } from 'src/services/run-companion-modules';

export const getVersion = Effect.flatMap(
  DEBUG_OVERRIDE_CONFIG.VERSION,
  Option.match({
    onNone: () => resolveRunningCliVersion(process.execPath, constants.APP_VERSION),
    onSome: version => Effect.succeed(version),
  })
);
