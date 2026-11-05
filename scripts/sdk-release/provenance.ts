import { Data, Effect, Schedule, Schema } from 'effect';
import type { Duration } from 'effect';
import { Digest } from 'effect/crypto';
import { Base64 } from 'effect/encoding';
import { FetchHttpClient, HttpClient } from 'effect/http';
import { SDK_RELEASE_REPOSITORY } from './github';
import { NPM_REGISTRY } from './lanes';
import type { Distribution } from './registry';
import { ensure, fail } from './runtime';
import { releaseTag } from './source';

/** The publisher every released file must name: this repository, workflow and release tag. */
export const RELEASE_PUBLISHER = {
  repository: SDK_RELEASE_REPOSITORY,
  workflow: 'sdk.release.yml',
  pypiEnvironment: 'pypi-release',
} as const;

const SLSA_PROVENANCE = 'https://slsa.dev/provenance/v1';

const NpmAttestations = Schema.Struct({
  attestations: Schema.Array(
    Schema.Struct({
      predicateType: Schema.String,
      bundle: Schema.Struct({ dsseEnvelope: Schema.Struct({ payload: Schema.String }) }),
    })
  ),
});
const SlsaStatement = Schema.Struct({
  subject: Schema.Array(Schema.Struct({ digest: Schema.Struct({ sha512: Schema.String }) })),
  predicate: Schema.Struct({
    buildDefinition: Schema.Struct({
      externalParameters: Schema.Struct({
        workflow: Schema.Struct({
          ref: Schema.String,
          repository: Schema.String,
          path: Schema.String,
        }),
      }),
    }),
  }),
});
const PypiProvenance = Schema.Struct({
  attestation_bundles: Schema.Array(
    Schema.Struct({
      publisher: Schema.Struct({
        kind: Schema.String,
        repository: Schema.String,
        workflow: Schema.String,
        environment: Schema.optionalKey(Schema.NullOr(Schema.String)),
      }),
    })
  ),
});

/** Provenance can trail an upload by a few seconds, so a missing document is retried. */
class ProvenancePending extends Data.TaggedError('ProvenancePending')<{ readonly url: string }> {}

/** How long to wait for provenance that trails an upload. */
export interface ProvenanceWait {
  readonly attempts?: number;
  readonly spacing?: Duration.Input;
}

const provenanceJson = <S extends Schema.Top>(url: string, schema: S, wait: ProvenanceWait) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const response = yield* client.get(url);
    if (response.status === 404) return yield* new ProvenancePending({ url });
    yield* ensure(response.status === 200, `Provenance lookup failed: ${url} (${response.status})`);
    return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(yield* response.text);
  }).pipe(
    Effect.provideService(FetchHttpClient.RequestInit, { redirect: 'error' }),
    Effect.retry({
      schedule: Schedule.spaced(wait.spacing ?? '10 seconds'),
      times: (wait.attempts ?? 6) - 1,
      while: error => error instanceof ProvenancePending,
    }),
    Effect.catchTag('ProvenancePending', error =>
      fail(`No provenance is published at ${error.url}`)
    )
  );

/**
 * The npm SLSA provenance of a published tarball must name this repository, the release
 * workflow and this batch's tag, and its subject must be the reviewed bytes.
 */
export const verifyNpmProvenance = (file: Distribution, id: string, wait: ProvenanceWait = {}) =>
  Effect.gen(function* () {
    const url = `${NPM_REGISTRY}/-/npm/v1/attestations/${encodeURIComponent(file.name)}@${file.version}`;
    const { attestations } = yield* provenanceJson(url, NpmAttestations, wait);
    const slsa = attestations.find(attestation => attestation.predicateType === SLSA_PROVENANCE);
    if (!slsa) return yield* fail(`${file.name}@${file.version} has no SLSA provenance`);
    const payload = yield* Effect.fromResult(Base64.decodeString(slsa.bundle.dsseEnvelope.payload));
    const statement = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(SlsaStatement))(
      payload
    );
    const { workflow } = statement.predicate.buildDefinition.externalParameters;
    yield* ensure(
      workflow.repository === `https://github.com/${RELEASE_PUBLISHER.repository}` &&
        workflow.path === `.github/workflows/${RELEASE_PUBLISHER.workflow}` &&
        workflow.ref === `refs/tags/${releaseTag(id)}`,
      `${file.name}@${file.version} was built by ${workflow.repository} ${workflow.path} at ${workflow.ref}, not by this release`
    );
    const digest = yield* Digest.Digest;
    const sha512 = yield* digest.digestHex(Digest.sha512, file.bytes);
    yield* ensure(
      statement.subject.some(subject => subject.digest.sha512 === sha512),
      `${file.name}@${file.version} provenance describes other bytes than the reviewed tarball`
    );
  });

/** Every PyPI file must carry a PEP 740 attestation from this repository's release workflow. */
export const verifyPypiProvenance = (file: Distribution, wait: ProvenanceWait = {}) =>
  Effect.gen(function* () {
    const url = `https://pypi.org/integrity/${file.name}/${file.version}/${file.file}/provenance`;
    const { attestation_bundles } = yield* provenanceJson(url, PypiProvenance, wait);
    yield* ensure(
      attestation_bundles.some(
        ({ publisher }) =>
          publisher.kind === 'GitHub' &&
          publisher.repository === RELEASE_PUBLISHER.repository &&
          publisher.workflow === RELEASE_PUBLISHER.workflow &&
          publisher.environment === RELEASE_PUBLISHER.pypiEnvironment
      ),
      `${file.file} is not attested by ${RELEASE_PUBLISHER.repository} ${RELEASE_PUBLISHER.workflow} in ${RELEASE_PUBLISHER.pypiEnvironment}`
    );
  });
