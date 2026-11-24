import { Context, Effect, Layer, Option, Schema, Stream } from 'effect';
import {
  GitHub,
  GitHubApiError,
  GitHubContractError,
  PositiveInt,
  paginateArray,
  request,
  requestOptional,
} from '../lib/github.ts';

export const WORKFLOW_BOT = 'github-actions[bot]';
const WRITE_PERMISSIONS = new Set(['admin', 'maintain', 'write']);

const Login = Schema.Struct({ login: Schema.String });
const LabelName = Schema.Struct({ name: Schema.String });

export const GitHubIssue = Schema.Struct({
  number: PositiveInt,
  title: Schema.NullOr(Schema.String),
  body: Schema.optionalKey(Schema.NullOr(Schema.String)),
  html_url: Schema.String,
  state: Schema.Literals(['open', 'closed']),
  labels: Schema.Array(LabelName),
  user: Schema.NullOr(Schema.Struct({ login: Schema.String, id: Schema.Number })),
  closed_by: Schema.optionalKey(Schema.NullOr(Login)),
  pull_request: Schema.optionalKey(Schema.Unknown),
});

/** The issue fields triage reads, decoded once at the GitHub boundary. */
export interface Issue {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly url: string;
  readonly state: 'open' | 'closed';
  readonly labels: readonly string[];
  readonly author: { readonly login: string; readonly id?: number };
  readonly closedByWorkflow: boolean;
  readonly isPullRequest: boolean;
}

export const toIssue = (raw: typeof GitHubIssue.Type): Issue => ({
  number: raw.number,
  title: raw.title ?? '',
  body: raw.body ?? '',
  url: raw.html_url,
  state: raw.state,
  labels: raw.labels.map(label => label.name),
  author: raw.user ?? { login: 'unknown' },
  closedByWorkflow: raw.closed_by?.login === WORKFLOW_BOT,
  isPullRequest: raw.pull_request !== undefined,
});

export type GitHubError = GitHubApiError | GitHubContractError;
type Op<A = void> = Effect.Effect<A, GitHubError>;

export interface LabelSpec {
  readonly name: string;
  readonly color: string;
  readonly description: string;
}

/** The issue writes triage makes, scoped to one repository. */
export class Issues extends Context.Service<
  Issues,
  {
    readonly get: (number: number) => Op<Issue>;
    readonly listOpen: (label: string) => Op<ReadonlyArray<number>>;
    readonly canWrite: (login: string) => Op<boolean>;
    readonly ensureLabel: (label: LabelSpec) => Op;
    readonly addLabels: (number: number, labels: ReadonlyArray<string>) => Op;
    readonly removeLabel: (number: number, label: string) => Op;
    readonly hasWorkflowComment: (number: number, marker: string) => Op<boolean>;
    readonly comment: (number: number, body: string) => Op;
    readonly setState: (number: number, state: 'open' | 'closed', reason?: 'completed' | 'not_planned') => Op;
    readonly assign: (number: number, assignees: ReadonlyArray<string>) => Op;
  }
>()('issue-triage/Issues') {
  static readonly layer = (repository: string) =>
    Layer.effect(
      Issues,
      Effect.gen(function* () {
        const github = yield* GitHub;
        const repo = `/repos/${repository}`;
        const issue = (number: number) => `${repo}/issues/${number}`;
        const send = (method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown) =>
          request(method, path, Schema.Unknown, body).pipe(Effect.asVoid, Effect.provideService(GitHub, github));
        const read = <S extends Schema.Top>(path: string, schema: S) =>
          requestOptional(path, schema).pipe(Effect.provideService(GitHub, github));
        const list = <S extends Schema.Top>(path: string, item: S) =>
          Stream.runCollect(paginateArray(path, item)).pipe(Effect.provideService(GitHub, github));
        const notFoundAs =
          <A>(value: A) =>
          (error: GitHubError) =>
            error._tag === 'GitHubApiError' && error.status === 404 ? Effect.succeed(value) : Effect.fail(error);

        return Issues.of({
          get: number =>
            request('GET', issue(number), GitHubIssue).pipe(Effect.map(toIssue), Effect.provideService(GitHub, github)),
          listOpen: label =>
            list(
              `${repo}/issues?state=open&labels=${encodeURIComponent(label)}`,
              Schema.Struct({ number: PositiveInt, pull_request: Schema.optionalKey(Schema.Unknown) })
            ).pipe(Effect.map(issues => issues.filter(item => item.pull_request === undefined).map(item => item.number))),
          canWrite: login =>
            read(`${repo}/collaborators/${encodeURIComponent(login)}/permission`, Schema.Struct({ permission: Schema.String })).pipe(
              Effect.map(found => Option.exists(found, ({ permission }) => WRITE_PERMISSIONS.has(permission)))
            ),
          ensureLabel: ({ name, color, description }) => {
            const exists = read(`${repo}/labels/${encodeURIComponent(name)}`, Schema.Unknown).pipe(Effect.map(Option.isSome));
            // Another issue's run may create the label first; a 422 is success once the label exists.
            const create = send('POST', `${repo}/labels`, { name, color, description }).pipe(
              Effect.catchTag('GitHubApiError', error =>
                error.status === 422
                  ? Effect.flatMap(exists, created => (created ? Effect.void : Effect.fail(error)))
                  : Effect.fail(error)
              )
            );
            return Effect.flatMap(exists, found => (found ? Effect.void : create));
          },
          addLabels: (number, labels) => send('POST', `${issue(number)}/labels`, { labels }),
          removeLabel: (number, label) =>
            send('DELETE', `${issue(number)}/labels/${encodeURIComponent(label)}`).pipe(Effect.catch(notFoundAs(undefined))),
          hasWorkflowComment: (number, marker) =>
            list(
              `${issue(number)}/comments`,
              Schema.Struct({ user: Schema.NullOr(Login), body: Schema.optionalKey(Schema.NullOr(Schema.String)) })
            ).pipe(
              Effect.map(comments =>
                comments.some(comment => comment.user?.login === WORKFLOW_BOT && (comment.body ?? '').includes(marker))
              )
            ),
          comment: (number, body) => send('POST', `${issue(number)}/comments`, { body }),
          setState: (number, state, reason) =>
            send('PATCH', issue(number), reason === undefined ? { state } : { state, state_reason: reason }),
          assign: (number, assignees) => send('POST', `${issue(number)}/assignees`, { assignees }),
        });
      })
    );
}
