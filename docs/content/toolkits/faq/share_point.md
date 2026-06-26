## What should I know about SharePoint REST APIs and SharePoint Graph?

Treat the current SharePoint toolkit and the SharePoint Graph toolkit as separate API families, not as interchangeable variants of the same connection.

- The current SharePoint toolkit uses SharePoint REST/OData endpoints on the tenant SharePoint host, usually shaped like `https://<tenant>.sharepoint.com/_api/...`.
- The SharePoint Graph toolkit uses Microsoft Graph endpoints, usually shaped like `https://graph.microsoft.com/v1.0/sites/...`.
- The scopes and token audience must match the endpoint family. SharePoint REST expects a SharePoint resource token such as `https://<tenant>.sharepoint.com/.default`; SharePoint Graph expects Microsoft Graph permissions/scopes such as `Sites.*`, `Files.*`, `User.Read`, or `https://graph.microsoft.com/.default` for S2S.
- Do not reuse an existing SharePoint REST connected account/token for SharePoint Graph. A Graph-scoped token is not valid for SharePoint REST, and a SharePoint-audience token is not valid for Graph.
- The same Microsoft Entra app registration may be reused only if it has the right API permissions and redirect/client-credential setup for the target toolkit, but the user should create/use a separate Composio auth config and reconnect.

SharePoint REST is not deprecated just because SharePoint Add-Ins / Azure ACS are retiring. Microsoft still documents SharePoint REST/CSOM as valid when Graph does not cover the needed functionality. Graph is the unified Microsoft 365 API and is usually better for cross-service or client-secret S2S flows, but it does not have perfect parity with SharePoint REST.

The SharePoint and SharePoint Graph toolkits use different Microsoft API surfaces.

The existing SharePoint toolkit uses SharePoint REST/OData endpoints such as `https://<tenant>.sharepoint.com/_api/...` and needs a SharePoint-resource scope like `https://<tenant>.sharepoint.com/.default`.

The SharePoint Graph toolkit uses Microsoft Graph endpoints such as `https://graph.microsoft.com/v1.0/sites/...` and needs Graph permissions such as `Sites.*`, `Files.*`, `User.Read`, or for S2S `https://graph.microsoft.com/.default`.

Because the tokens are issued for different resources, please create/use a separate Composio auth config for SharePoint Graph and reconnect. You may be able to reuse the same Microsoft Entra app registration if it has the required Graph permissions configured, but the existing SharePoint connected account token should not be used for SharePoint Graph.

## How should I handle `/teams/` SharePoint sites require the server-relative Subsite path?

If a user's SharePoint site URL is under `/teams/<site>` instead of `/sites/<site>`, do not tell them to pass only `<site>` in the SharePoint Subsite field. A bare subsite value is interpreted as `/sites/<site>` by the toolkit.

Re-initiate or reconnect the SharePoint account and set SharePoint Subsite to the full server-relative path, for example `/teams/<site>`. For per-call overrides, pass `site_name: "/teams/<site>"`.

This looks like a SharePoint site-path mismatch. Your site is under `/teams/...`, but the current connection/tool call is hitting `/sites/...`, which SharePoint returns as 404.

Please reconnect the SharePoint account and set the Subsite value to the full server-relative path: `/teams/<site-name>`. If you're passing it per tool call, use `site_name: "/teams/<site-name>"`. A bare value like `<site-name>` gets treated as `/sites/<site-name>`.

## How do I create Folder: OData type-name error?

If `SHARE_POINT_SHAREPOINT_CREATE_FOLDER` fails with:

An entry without a type name was found, but no expected type was specified.

treat it as a SharePoint tool payload issue rather than a user connection issue when the same call also fails in the Composio playground.

- Tool slug: `SHARE_POINT_SHAREPOINT_CREATE_FOLDER`
- HTTP status: 400
- Request mode uses `application/json;odata=verbose`
- The body must include SharePoint folder type metadata for the REST create-folder endpoint:

```json
{
  "__metadata": {
    "type": "SP.Folder"
  },
  "ServerRelativeUrl": "/document library relative url/folder name"
}
```

Workaround: create the folder with a direct SharePoint REST/proxy call that includes the `SP.Folder` metadata, or create the folder manually in SharePoint.

## How should I handle sharePoint REST app-only client credentials use certificate auth?

For the current Composio `share_point` toolkit, client credentials and certificate-based authentication are the same app-only path: client credentials is implemented with certificate-based authentication.

The required setup is:

- SharePoint tenant name, used for `https://<tenant>.sharepoint.com/_api` and the resource scope `https://<tenant>.sharepoint.com/.default`
- Microsoft Entra tenant ID
- Application/client ID
- RSA private key in PEM format for the certificate uploaded to the Entra app registration
- Certificate thumbprint (`x5t#S256`)
- Admin-consented SharePoint application permissions appropriate for the use case

Composio signs a JWT client assertion with the certificate/private key and requests a token from `https://login.microsoftonline.com/<tenantId>/oauth2/v2.0/token` using `grant_type=client_credentials` and the SharePoint `.default` scope. Users should provide the fields above; they do not need to manually construct or pass a JWT assertion.

Scope wording: the token request uses `https://<tenant>.sharepoint.com/.default`. In Microsoft client credentials, `.default` means the token is issued for the application permissions/app roles already configured and admin-consented for that SharePoint resource. Composio's action-to-scope mapping API should not be recommended for this SharePoint S2S/certificate path today; it is useful for OAuth2 scope discovery, not as the S2S permission source of truth.

Setup outline:

1. Generate a private key and self-signed/public certificate, for example with OpenSSL.
2. Upload the public certificate to the Microsoft Entra app registration under Certificates & secrets > Certificates.
3. Add/admin-consent SharePoint application permissions, such as the least-privileged site/list/file permission set appropriate for the user.
4. Create/connect the Composio SharePoint S2S auth config with the SharePoint tenant name, Entra tenant ID, client ID, private key PEM, and certificate thumbprint. Composio handles the JWT client assertion and token exchange.
5. Ensure the Entra app has/admin-consented the SharePoint application permissions needed for the intended SharePoint REST operations. The requested token scope is `https://<tenant>.sharepoint.com/.default`; if using Selected permissions such as `Sites.Selected`, also grant explicit access to the target site/list/file.
6. Test with a simple SharePoint REST call such as `GET https://<tenant>.sharepoint.com/_api/web?$select=Title` using the connected account.
