import { Effect, Option } from 'effect';
import { DEBUG_OVERRIDE_CONFIG } from 'src/effects/debug-config';
import * as constants from 'src/constants';
import { resolveInstalledCliVersion } from 'src/services/run-companion-modules';

let cachedInstalledCliVersion: string | undefined;

export const getInstalledCliVersion = Effect.gen(function* () {
  if (cachedInstalledCliVersion === undefined) {
    cachedInstalledCliVersion = yield* resolveInstalledCliVersion(
      process.execPath,
      constants.APP_VERSION
    );
  }
  return cachedInstalledCliVersion;
});

export const getVersion = Effect.flatMap(
  DEBUG_OVERRIDE_CONFIG.VERSION,
  Option.match({
    onNone: () => getInstalledCliVersion,
    onSome: version => Effect.succeed(version),
  })
);
