import { Config, Context, Duration, Effect, Layer, Option, Record, Redacted, Schema } from 'effect';
import { FetchHttpClient, HttpClient } from 'effect/http';
import {
  HttpStatus,
  InvalidResponse,
  MissingApiKey,
  TimedOut,
  Unreachable,
  apiKey,
  decodeJson,
  describeFailure,
  postJson,
} from './http.ts';

export const JEV_MODEL = 'jev-1.13.0';
const JEV_URL = 'https://api.typesafe.ai/v1/systemone';

export const QUESTIONS = {
  account_specific: {
    type: 'noul',
    instructions:
      "Does resolving `issue` need someone to look at the reporter's own Composio account, project, billing, usage limits, connected accounts, auth configs, or logs?",
  },
  hosted_problem: {
    type: 'noul',
    instructions:
      "Is the problem in `issue` on Composio's hosted service (API, dashboard, Connect, managed OAuth apps, hosted MCP, tool execution backend) or in how a specific hosted Composio toolkit or tool behaves (its parameters, output, auth scopes, or errors), rather than in code the reporter installs from this repository?",
  },
  sdk_code: {
    type: 'noul',
    instructions:
      'Does `issue` point at a defect, missing feature, or docs gap in the Python SDK, TypeScript SDK, Composio CLI, or documentation source code itself?',
  },
  new_toolkit: {
    type: 'noul',
    instructions: 'Does `issue` ask Composio to add an app integration or toolkit that does not exist yet?',
  },
  is_bug: {
    type: 'noul',
    instructions:
      'Is `issue` primarily reporting broken behavior, a defect, an error, a regression, or unexpected behavior (not a feature request, question, or new-toolkit request)?',
  },
  missing_details: {
    type: 'noul',
    instructions:
      'Is `issue` missing the information needed to reproduce or investigate it (such as reproduction steps, expected vs. actual behavior, environment, or error details)?',
  },
  feature_request: {
    type: 'noul',
    instructions:
      'Is `issue` asking for a new feature or improvement to the Composio SDKs, CLI, docs, or platform (not a request for a new app integration or toolkit)?',
  },
  sdk_area: {
    type: 'choice',
    instructions: 'Which area of this repository does `issue` primarily concern?',
    criteria: {
      ts: 'TypeScript SDK code or TypeScript packages other than the CLI in this repository',
      py: 'Python SDK code in this repository',
      cli: 'The Composio CLI experience or ts/packages/cli',
      docs: 'Documentation content or the docs site',
      none: 'None of the above (or primarily a hosted service, account, or new-toolkit request without a specific repository area)',
    },
  },
} as const;

export const SDK_AREAS = ['ts', 'py', 'cli', 'docs'] as const;
export type SdkArea = (typeof SDK_AREAS)[number];
export type SdkAreaChoice = SdkArea | 'none';

const Probability = Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 1 }));
const AreaProbabilities = Schema.Struct({
  ts: Probability,
  py: Probability,
  cli: Probability,
  docs: Probability,
  none: Probability,
});

/** One probability per yes/no question, and a probability per area for `sdk_area`. */
export const JevAnswers = Schema.Struct({
  account_specific: Probability,
  hosted_problem: Probability,
  sdk_code: Probability,
  new_toolkit: Probability,
  is_bug: Probability,
  missing_details: Probability,
  feature_request: Probability,
  sdk_area: AreaProbabilities,
} satisfies { readonly [K in keyof typeof QUESTIONS]: Schema.Top });
export type JevAnswers = typeof JevAnswers.Type;

const Noul = Schema.Struct({ noul: Probability });
const JevResponse = Schema.Struct({
  answers: Schema.Struct({
    account_specific: Noul,
    hosted_problem: Noul,
    sdk_code: Noul,
    new_toolkit: Noul,
    is_bug: Noul,
    missing_details: Noul,
    feature_request: Noul,
    sdk_area: Schema.Struct({ probabilities: AreaProbabilities }),
  }),
});

export class JevError extends Schema.TaggedError<JevError>()('JevError', {
  reason: Schema.Union([MissingApiKey, TimedOut, Unreachable, HttpStatus, InvalidResponse]),
}) {
  override get message() {
    return `Jev API request failed: ${describeFailure(this.reason)}`;
  }
}

export interface IssueText {
  readonly title: string;
  readonly body: string;
}

export class Jev extends Context.Service<
  Jev,
  { readonly classify: (issue: IssueText) => Effect.Effect<JevAnswers, JevError> }
>()('issue-triage/Jev') {
  static readonly make = (key: Option.Option<Redacted.Redacted>, timeout: Duration.Input = '30 seconds') =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      const classify = Effect.fnUntraced(
        function* (issue: IssueText) {
          const answer = yield* postJson(
            JEV_URL,
            yield* apiKey('TYPESAFE_API_KEY', key),
            { state: { issue }, questions: QUESTIONS, model: JEV_MODEL },
            timeout
          );
          if (answer.status < 200 || answer.status >= 300) return yield* new HttpStatus({ status: answer.status });
          const { answers } = yield* decodeJson(JevResponse, answer);
          const { sdk_area, ...nouls } = answers;
          return { ...Record.map(nouls, ({ noul }) => noul), sdk_area: sdk_area.probabilities };
        },
        Effect.mapError(reason => new JevError({ reason })),
        Effect.provideService(HttpClient.HttpClient, client)
      );
      return Jev.of({ classify });
    });

  static readonly layer = Layer.effect(
    Jev,
    Effect.flatMap(Config.option(Config.Redacted('TYPESAFE_API_KEY')), key => Jev.make(key))
  ).pipe(Layer.provide(FetchHttpClient.layer));
}
