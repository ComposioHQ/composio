The SharePoint toolkit and the SharePoint Graph toolkit are separate API families, not interchangeable variants of one connection.

- **SharePoint** calls SharePoint REST/OData endpoints on your tenant host, shaped like `https://<tenant>.sharepoint.com/_api/...`. It expects a SharePoint resource token such as `https://<tenant>.sharepoint.com/.default`.
- **SharePoint Graph** calls Microsoft Graph endpoints, shaped like `https://graph.microsoft.com/v1.0/sites/...`. It expects Graph permissions such as `Sites.*`, `Files.*`, `User.Read`, or `https://graph.microsoft.com/.default` for service-to-service auth.

## Do not mix the two

Adding Graph scopes such as `Sites.Read.All` or `User.Read.All` to a SharePoint REST auth config produces a Graph-audience token, which returns 401 when the toolkit calls SharePoint REST. The reverse also holds: a SharePoint-audience token is not valid for Graph.

Create a separate Composio auth config for each and connect through both. The same Microsoft Entra app registration can be reused if it carries the right API permissions and redirect or client-credential setup for the target toolkit, but the connected accounts must stay distinct.

## REST is still supported

SharePoint REST is not deprecated because SharePoint Add-Ins and Azure ACS are retiring. Microsoft still documents SharePoint REST and CSOM as valid where Graph does not cover the functionality. Graph is the unified Microsoft 365 API and is usually the better choice for cross-service or client-secret flows, but parity with SharePoint REST is not complete.
