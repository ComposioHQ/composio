import { Effect, Option } from 'effect';
import { getSessionInfoByUserApiKey } from 'src/services/composio-clients';
import { ComposioUserContext } from 'src/services/user-context';

export interface WhoamiInfo {
  readonly apiKey?: string;
  readonly email?: string;
  readonly defaultOrgId?: string;
  readonly defaultOrgName?: string;
  readonly testUserId?: string;
}

export const resolveWhoamiInfo: Effect.Effect<WhoamiInfo, never, ComposioUserContext> = Effect.gen(
  function* () {
    const ctx = yield* ComposioUserContext;
    const apiKey = Option.getOrUndefined(ctx.data.apiKey);
    const defaultOrgId = Option.getOrUndefined(ctx.data.orgId);
    const testUserId = Option.getOrUndefined(ctx.data.testUserId);

    if (!apiKey) {
      return {
        defaultOrgId,
        testUserId,
      } satisfies WhoamiInfo;
    }

    const sessionInfo = yield* getSessionInfoByUserApiKey({
      baseURL: ctx.data.baseURL,
      userApiKey: apiKey,
    }).pipe(Effect.option);
    const session = Option.getOrUndefined(sessionInfo);
    const sessionOrgId = session?.project.org.id;
    const sessionOrgName = session?.project.org.name;

    return {
      apiKey,
      email: session?.org_member.email,
      defaultOrgId,
      defaultOrgName: !defaultOrgId || sessionOrgId === defaultOrgId ? sessionOrgName : undefined,
      testUserId,
    } satisfies WhoamiInfo;
  }
);
