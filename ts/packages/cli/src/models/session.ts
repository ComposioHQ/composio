import { Schema } from 'effect';

export const Session = Schema.Struct({
  id: Schema.String,
  code: Schema.String,
  expiresAt: Schema.DateTimeUtcFromString,
  status: Schema.Literals(['pending', 'linked']),
}).annotate({ identifier: 'Session' });
export type Session = Schema.Schema.Type<typeof Session>;

export const CreatedSession = Schema.Struct({
  ...Session.fields,
  code_challenge_method: Schema.optional(Schema.NullOr(Schema.String)),
}).annotate({ identifier: 'CreatedSession' });
export type CreatedSession = Schema.Schema.Type<typeof CreatedSession>;

const SessionAccount = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  name: Schema.String,
}).annotate({ identifier: 'SessionAccount' });
export type SessionAccount = Schema.Schema.Type<typeof SessionAccount>;

export const RetrievedSession = Schema.Union([
  Schema.Struct({ ...Session.fields, api_key: Schema.Null, status: Schema.Literal('pending') }),
  Schema.Struct({
    ...Session.fields,
    api_key: Schema.String,
    account: SessionAccount.annotate({ identifier: 'RetrievedSession.Account' }),
    status: Schema.Literal('linked'),
  }),
]).annotate({ identifier: 'RetrievedSession' });
export type RetrievedSession = Schema.Schema.Type<typeof RetrievedSession>;
