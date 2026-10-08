## Request `offline_access` when a delegated connection needs refresh tokens

Microsoft's v2 OAuth endpoint requires an explicit `offline_access` request to
return refresh tokens. Composio's standard Microsoft delegated OAuth scope sets
include it. For a customer-owned Microsoft app, include `offline_access` in the
app and Composio auth-config scopes before creating a new connection.

Microsoft documents this behavior in
[Scopes and permissions in the Microsoft identity platform](https://learn.microsoft.com/en-us/entra/identity-platform/scopes-oidc#the-offline_access-scope).

## Some Microsoft tenant policies and permissions require administrator consent

A work or school account can show **Needs Admin Approval** or **Admin approval
required** when the tenant prevents users from approving the app or when the
requested permission is administrator-restricted. A tenant administrator must
approve the selected Composio-managed app or the customer's own app and its
requested permissions. The affected user should then start a fresh connection.

Adding a permission to an Entra app registration does not itself grant tenant
consent. Microsoft explains the distinction in its
[permissions and consent overview](https://learn.microsoft.com/en-us/entra/identity-platform/permissions-consent-overview).

This guidance applies across Microsoft toolkits that use delegated Microsoft
OAuth, including Outlook, Microsoft Teams, OneDrive, OneNote, Excel, Power BI,
and Dynamics 365. SharePoint REST and app-only/S2S flows may
also require resource-specific permissions and administrator consent.
