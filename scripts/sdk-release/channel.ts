import { Effect, Schema } from 'effect';

/** Who a release is for: stable installs by default, beta only when asked for. */
export const Channel = Schema.Literals(['stable', 'beta']);
export type Channel = typeof Channel.Type;
export const stableByDefault = Channel.pipe(
  Schema.withDecodingDefaultKey(Effect.succeed('stable' as const))
);

/**
 * Everything that differs between channels. The request, the release PR, the gate, the tag and
 * the reviewed files are the same for both.
 */
export const CHANNELS = {
  stable: {
    /** The npm dist-tag a published version moves forward. */
    npmTag: 'latest',
    /**
     * Whether the release PR commits versions, changelogs and references to `next`. A beta PR
     * commits only its plan, so `next` stays stable and every changeset stays pending.
     */
    commitsVersions: true,
    /** Checks the release PR head needs besides the candidate checks. */
    extraChecks: ['typescript-check'],
    /** Whether publishing opens a docs PR that pins the released npm versions. */
    pinsDocs: true,
  },
  beta: {
    // `beta` belongs to the 1.0 prerelease train on `main`; previews of `next` use `next`.
    npmTag: 'next',
    commitsVersions: false,
    // A beta PR does not touch the docs, so the docs check never runs on it.
    extraChecks: [],
    pinsDocs: false,
  },
} as const satisfies Record<
  Channel,
  {
    readonly npmTag: string;
    readonly commitsVersions: boolean;
    readonly extraChecks: ReadonlyArray<string>;
    readonly pinsDocs: boolean;
  }
>;

/**
 * Changesets snapshot settings for a beta: the version the changesets would release, suffixed
 * with the planning run, such as `0.29.0-beta.19087654321`. The run ID is unique and grows over
 * time, so betas sort in request order without reading the registry or the clock.
 */
export const betaSnapshot = (run: string) => ({
  config: { useCalculatedVersion: true, prereleaseTemplate: `{tag}.${run}` },
  parameters: { tag: 'beta' },
});

const BETA = /^(\d+\.\d+\.\d+)-beta\.(\d+)$/;

/** The PEP 440 spelling of a planned version: `1.2.3-beta.45` is published as `1.2.3b45`. */
export const pythonVersion = (version: string) => version.replace(BETA, '$1b$2');
