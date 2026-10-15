type ZodVersion = {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
};

/**
 * The first zod release whose `zod/v4` shares its metadata registry through
 * `globalThis.__zod_globalRegistry`. Below it, two copies of zod in one
 * process keep separate registries, and the descriptions and annotations the
 * v4 builder writes are invisible to a serializer loaded from the other copy.
 */
export const ZOD_V4_FLOOR: ZodVersion = { major: 4, minor: 1, patch: 13 };

export const formatZodVersion = (version: ZodVersion): string =>
  `${version.major}.${version.minor}.${version.patch}`;

export const meetsZodV4Floor = (version: ZodVersion): boolean =>
  version.major !== ZOD_V4_FLOOR.major
    ? version.major > ZOD_V4_FLOOR.major
    : version.minor !== ZOD_V4_FLOOR.minor
      ? version.minor > ZOD_V4_FLOOR.minor
      : version.patch >= ZOD_V4_FLOOR.patch;
