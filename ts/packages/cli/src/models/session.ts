import { Schema } from 'effect';
import { JSONTransformSchema } from './utils/json-transform-schema';

export const Session = Schema.Struct({
  id: Schema.String,
  code: Schema.String,
  expiresAt: Schema.DateTimeUtc,
  status: Schema.Literal('pending', 'linked'),
}).annotations({ identifier: 'Session' });
export type Session = Schema.Schema.Type<typeof Session>;

export const SessionJSON = JSONTransformSchema(Session);
export const sessionFromJSON = Schema.decode(SessionJSON);
export const sessionToJSON = Schema.encode(SessionJSON);

const SessionAccount = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  name: Schema.String,
}).annotations({ identifier: 'SessionAccount' });
export type SessionAccount = Schema.Schema.Type<typeof SessionAccount>;

export const LinkedSession = Session.omit('status')
  .pipe(
    Schema.extend(
      Schema.Struct({
        status: Schema.Literal('linked'),
        account: SessionAccount.annotations({ identifier: 'LinkedSession.Account' }),
      })
    )
  )
  .annotations({ identifier: 'LinkedSession' });
export type LinkedSession = Schema.Schema.Type<typeof LinkedSession>;

export const LinkedSessionJSON = JSONTransformSchema(LinkedSession);
export const LinkedSessionFromJSON = Schema.decode(LinkedSessionJSON);
export const LinkedSessionToJSON = Schema.encode(LinkedSessionJSON);

export const RetrievedSession = Schema.Union(
  Schema.Struct({ ...Session.fields, status: Schema.Literal('pending') }),
  Schema.Struct({
    ...Session.fields,
    account: SessionAccount.annotations({ identifier: 'RetrievedSession.Account' }),
    status: Schema.Literal('linked'),
  })
).annotations({ identifier: 'RetrievedSession' });
export type RetrievedSession = Schema.Schema.Type<typeof RetrievedSession>;

export const RetrievedSessionJSON = JSONTransformSchema(RetrievedSession);
export const retrievedSessionFromJSON = Schema.decode(RetrievedSessionJSON);
export const retrievedSessionToJSON = Schema.encode(RetrievedSessionJSON);
