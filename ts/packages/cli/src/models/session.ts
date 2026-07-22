import { Schema } from 'effect';
import { JSONTransformSchema } from './utils/json-transform-schema';

export const Session = Schema.Struct({
  id: Schema.String,
  code: Schema.String,
  expiresAt: Schema.DateTimeUtc,
  status: Schema.Literals(['pending', 'linked']),
}).annotate({ identifier: 'Session' });
export type Session = Schema.Schema.Type<typeof Session>;

export const SessionJSON = JSONTransformSchema(Session);
export const sessionFromJSON = Schema.decodeEffect(SessionJSON);
export const sessionToJSON = Schema.encodeEffect(SessionJSON);

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

export const RetrievedSessionJSON = JSONTransformSchema(RetrievedSession);
export const retrievedSessionFromJSON = Schema.decodeEffect(RetrievedSessionJSON);
export const retrievedSessionToJSON = Schema.encodeEffect(RetrievedSessionJSON);
