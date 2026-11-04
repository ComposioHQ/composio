import { Effect, Option, Schema } from 'effect';
import {
  REPOSITORY_PATH,
  SDK_RELEASE_REPOSITORY,
  Sha,
  request,
  requestOptional,
  type ReleaseRun,
} from './github';

export const RELEASE_WORKFLOW_PATH = '.github/workflows/sdk.release.yml';
const RELEASE_TAG = /^sdk-release\/\d+$/;

const App = Schema.Struct({ id: Schema.Number, slug: Schema.String });
const TagRef = Schema.Struct({ object: Schema.Struct({ type: Schema.String, sha: Sha }) });

export interface ReleaseApp {
  readonly id: number;
  readonly slug: string;
}

/**
 * Why `run` is not a release tag run, or `undefined` when it is one: a `push` run of the release
 * workflow for an `sdk-release/*` tag, pushed by the release App, whose tag still points at the
 * run's commit.
 */
export const tagRunProblem = (run: ReleaseRun, expectedApp: ReleaseApp) =>
  Effect.gen(function* () {
    if (
      run.path !== RELEASE_WORKFLOW_PATH ||
      run.repository.full_name !== SDK_RELEASE_REPOSITORY ||
      run.event !== 'push' ||
      !RELEASE_TAG.test(run.head_branch ?? '') ||
      run.head_sha === undefined
    )
      return 'Publication requires the original protected source-tag push';
    const app = yield* request('GET', `/apps/${encodeURIComponent(expectedApp.slug)}`, App);
    if (
      app.id !== expectedApp.id ||
      app.slug !== expectedApp.slug ||
      run.actor?.type !== 'Bot' ||
      run.actor.login !== `${app.slug}[bot]`
    )
      return 'Publication source tag was not pushed by the dedicated SDK release App';
    const tag = yield* requestOptional(
      `${REPOSITORY_PATH}/git/ref/tags/${run.head_branch}`,
      TagRef
    );
    if (
      Option.isNone(tag) ||
      tag.value.object.type !== 'commit' ||
      tag.value.object.sha !== run.head_sha
    )
      return 'Publication tag source changed';
    return undefined;
  });
