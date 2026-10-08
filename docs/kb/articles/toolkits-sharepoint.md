## SharePoint REST APIs and SharePoint Graph are separate API families

Treat the current SharePoint toolkit and the SharePoint Graph toolkit as separate API families, not as interchangeable variants of the same connection.

- The current SharePoint toolkit uses SharePoint REST/OData endpoints on the tenant SharePoint host, usually shaped like `https://<tenant>.sharepoint.com/_api/...`.

- The SharePoint Graph toolkit uses Microsoft Graph endpoints, usually shaped like `https://graph.microsoft.com/v1.0/sites/...`.

- The scopes and token audience must match the endpoint family. SharePoint REST expects a SharePoint resource token such as `https://<tenant>.sharepoint.com/.default`; SharePoint Graph expects Microsoft Graph permissions/scopes such as `Sites.*`, `Files.*`, `User.Read`, or `https://graph.microsoft.com/.default` for S2S.

- Do not add Microsoft Graph scopes such as `Sites.Read.All` or `User.Read.All` to the current SharePoint REST auth config as a workaround. Those scopes produce a Graph-audience token and can cause 401 responses when the toolkit calls SharePoint REST.

- Do not reuse an existing SharePoint REST connected account/token for SharePoint Graph. A Graph-scoped token is not valid for SharePoint REST, and a SharePoint-audience token is not valid for Graph.

- The same Microsoft Entra app registration may be reused only if it has the right API permissions and redirect/client-credential setup for the target toolkit, but create or use a separate Composio auth config and reconnect.

SharePoint REST is not deprecated just because SharePoint Add-Ins / Azure ACS are retiring. Microsoft still documents SharePoint REST/CSOM as valid when Graph does not cover the needed functionality. Graph is the unified Microsoft 365 API and is usually better for cross-service or client-secret S2S flows, but it does not have perfect parity with SharePoint REST.

Example response:

```text
The SharePoint and SharePoint Graph toolkits use different Microsoft API surfaces.

The existing SharePoint toolkit uses SharePoint REST/OData endpoints such as `https://<tenant>.sharepoint.com/_api/...` and needs a SharePoint-resource scope like `https://<tenant>.sharepoint.com/.default`.

The SharePoint Graph toolkit uses Microsoft Graph endpoints such as `https://graph.microsoft.com/v1.0/sites/...` and needs Graph permissions such as `Sites.*`, `Files.*`, `User.Read`, or for S2S `https://graph.microsoft.com/.default`.

Because the tokens are issued for different resources, please create/use a separate Composio auth config for SharePoint Graph and reconnect. You may be able to reuse the same Microsoft Entra app registration if it has the required Graph permissions configured, but the existing SharePoint connected account token should not be used for SharePoint Graph.
```

## `/teams/` SharePoint sites require the server-relative Subsite path

If your SharePoint site URL is under `/teams/<site>` instead of `/sites/<site>`, do not pass only `<site>` in the SharePoint Subsite field. A bare subsite value is interpreted as `/sites/<site>` by the toolkit.

Reconnect the SharePoint account and set SharePoint Subsite to the full server-relative path, for example `/teams/<site>`. For per-call overrides, pass `site_name: "/teams/<site>"`.

Debugging signal: tool logs show SharePoint calls like `https://tenant.sharepoint.com/sites/<site>/_api/...` returning `404 FILE NOT FOUND`, while the customer's actual SharePoint URL is `https://tenant.sharepoint.com/teams/<site>`. If the connected account is `ACTIVE` and the auth config is enabled, treat this as a path-prefix mismatch first, not an OAuth issue.

Example response:

```text
This looks like a SharePoint site-path mismatch. Your site is under `/teams/...`, but the current connection/tool call is hitting `/sites/...`, which SharePoint returns as 404.

Please reconnect the SharePoint account and set the Subsite value to the full server-relative path: `/teams/<site-name>`. If you're passing it per tool call, use `site_name: "/teams/<site-name>"`. A bare value like `<site-name>` gets treated as `/sites/<site-name>`.
```

## SharePoint REST app-only client credentials use certificate auth

For the current Composio `share_point` toolkit, client credentials and certificate-based authentication are the same app-only path: client credentials is implemented with certificate-based authentication.

The required setup is:

- SharePoint tenant name, used for `https://<tenant>.sharepoint.com/_api` and the resource scope `https://<tenant>.sharepoint.com/.default`

- Microsoft Entra tenant ID

- Application/client ID

- RSA private key in PEM format for the certificate uploaded to the Entra app registration

- Certificate thumbprint (`x5t#S256`)

- Admin-consented SharePoint application permissions appropriate for the use case

Composio signs a JWT client assertion with the certificate/private key and requests a token from `https://login.microsoftonline.com/<tenantId>/oauth2/v2.0/token` using `grant_type=client_credentials` and the SharePoint `.default` scope. Customers should provide the fields above; they do not need to manually construct or pass a JWT assertion.

Scope wording: the token request uses `https://<tenant>.sharepoint.com/.default`. In Microsoft client credentials, `.default` means the token is issued for the application permissions/app roles already configured and admin-consented for that SharePoint resource. Composio's action-to-scope mapping API should not be recommended for this SharePoint S2S/certificate path today; it is useful for OAuth2 scope discovery, not as the S2S permission source of truth.

Do not offer a client-secret-only client-credentials setup for the SharePoint REST toolkit. That belongs to Microsoft Graph app-only flows and Composio's `sharepoint_graph` toolkit, which uses `https://graph.microsoft.com/.default` and accepts client ID + client secret. The legacy SharePoint Azure ACS app-only client ID/secret model existed but is retired and should not be recommended for new/current SharePoint REST integrations.

Example setup outline:

1. Generate a private key and self-signed/public certificate, for example with OpenSSL.

2. Upload the public certificate to the Microsoft Entra app registration under Certificates & secrets > Certificates.

3. Add/admin-consent SharePoint application permissions, such as the least-privileged site/list/file permission set appropriate for the customer.

4. Create/connect the Composio SharePoint S2S auth config with the SharePoint tenant name, Entra tenant ID, client ID, private key PEM, and certificate thumbprint. Composio handles the JWT client assertion and token exchange.

5. Ensure the Entra app has/admin-consented the SharePoint application permissions needed for the intended SharePoint REST operations. The requested token scope is `https://<tenant>.sharepoint.com/.default`; if using Selected permissions such as `Sites.Selected`, also grant explicit access to the target site/list/file.

6. Test with a simple SharePoint REST call such as `GET https://<tenant>.sharepoint.com/_api/web?$select=Title` using the connected account.

## SharePoint `.default` scope uses the tenant domain placeholder

For a custom Microsoft Entra app, replace `{{site_name}}` in `https://{{site_name}}.sharepoint.com/.default` with the customer's SharePoint tenant/domain name. The resulting `.default` scope requests the application permissions already configured and admin-consented for that SharePoint resource.

## Pass the SharePoint tenant/subdomain during connection initiation

The SharePoint tenant/subdomain is an explicit connection field; Composio does not derive it automatically from the OAuth token. If a connection points at `default.sharepoint.com` or the wrong tenant, reinitiate the connection and provide the correct tenant name.

## The SharePoint subsite field is not a permission boundary

The SharePoint Subsite field supplies a default target when a tool call omits `site_name`. It does not restrict the Microsoft token, which retains the access granted to the consenting user or application.

## Retrieve SharePoint site name from connected account state

Fetch the connected account and inspect its stored state to confirm the SharePoint site name. Newer SDK responses expose it under a shape such as `state.val.site_name`; older toolset responses may expose `data.site_name`.

## Use `SHARE_POINT_SEARCH_QUERY` for KQL/FQL SharePoint search

Use `SHARE_POINT_SEARCH_QUERY` when a workflow needs flexible SharePoint search with KQL or FQL. For broader agentic discovery across SharePoint actions, Tool Router can discover and execute the relevant tools dynamically.

## SharePoint toolkit slug is `share_point`

The SharePoint toolkit slug is `share_point`, while its tool slugs use the `SHARE_POINT_...` prefix. Related Microsoft toolkit slugs include `outlook`, `one_drive`, and `sharepoint_graph`.

## Disable destructive SharePoint tools with `destructiveHint` or explicit tool filters

At session creation, disable tools carrying `destructiveHint` globally or for selected toolkits such as SharePoint and OneDrive. For finer control, explicitly allow or deny destructive tools by name.

## `SHARE_POINT_UPLOAD_FROM_URL` needs a server-fetchable URL

This action first downloads `file_url` from Composio's backend and then uploads the bytes to SharePoint. The source must be a reachable HTTP(S) download URL; raw base64 content is not a URL.

For base64 or in-memory bytes, use `SHARE_POINT_UPLOAD_FILE` with the file content and name, or first create a temporary URL that the backend can reach. A 401/403 while downloading the source should be debugged as source-URL access, not as a destination folder problem. `conflict_behavior="rename"` only affects the target name after download succeeds.
