import { Effect } from 'effect';
import {
  analyticsIdentityLinkingEnabled,
  linkApolloIdentityForAnalytics,
} from 'src/analytics/dispatch';
import { getSessionInfoByUserApiKey } from 'src/services/composio-clients';

type KnownOrgIdentity = {
  readonly orgId: string;
  readonly orgMemberId: string;
};

export const linkAnalyticsIdentityForOrg = (params: {
  readonly apiKey: string;
  readonly baseURL: string;
  readonly orgId: string;
  readonly knownIdentity?: KnownOrgIdentity;
}) =>
  Effect.gen(function* () {
    const knownIdentity =
      params.knownIdentity?.orgId === params.orgId ? params.knownIdentity : undefined;
    if (!knownIdentity && !(yield* analyticsIdentityLinkingEnabled)) {
      return;
    }
    const orgMemberId = knownIdentity
      ? knownIdentity.orgMemberId
      : yield* getSessionInfoByUserApiKey({
          baseURL: params.baseURL,
          userApiKey: params.apiKey,
          orgId: params.orgId,
        }).pipe(
          Effect.map(sessionInfo => sessionInfo.org_member.id),
          Effect.catchAll(error =>
            Effect.logDebug('Failed to resolve analytics identity for selected org:', error).pipe(
              Effect.as(undefined)
            )
          )
        );

    if (orgMemberId) {
      yield* linkApolloIdentityForAnalytics(orgMemberId, params.apiKey);
    }
  });
