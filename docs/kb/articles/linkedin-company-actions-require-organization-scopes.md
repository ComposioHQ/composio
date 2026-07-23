LinkedIn company-page actions require three gates: the developer app product or permission, a token issued with the organization scope, and the member's eligible Page role.

## Diagnose the active connection

Personal LinkedIn actions can work while organization actions return 403. The standard LinkedIn configuration currently requests personal scopes, not organization permissions. Reconnecting an unchanged auth config does not add a missing scope.

## Reconnect with the required grant

1. Enable the appropriate LinkedIn product or permission on the developer app.
2. Use an auth config that explicitly requests the organization scope required by the selected action.
3. Create a new grant, verify the member's Page role, then retry through the [LinkedIn toolkit](/toolkits/linkedin).

Provider approval alone does not grant the concrete token scope or Page role. LinkedIn documents [organization posting permissions](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-02) and [organization access control](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/organization-access-control-by-role?view=li-lms-2026-01).
