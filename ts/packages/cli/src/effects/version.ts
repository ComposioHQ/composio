import { Effect, Option } from 'effect';
import { DEBUG_OVERRIDE_CONFIG } from 'src/effects/debug-config';
import * as constants from 'src/constants';

export const getVersion = Effect.map(
  DEBUG_OVERRIDE_CONFIG.VERSION,
  Option.getOrElse(() => constants.APP_VERSION)
);
