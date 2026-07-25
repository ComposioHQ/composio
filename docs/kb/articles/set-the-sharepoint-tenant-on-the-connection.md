The SharePoint tenant or subdomain is an explicit connection field. Composio does not derive it from the OAuth token, so it has to be supplied when the connection is initiated.

If a connection points at `default.sharepoint.com` or at the wrong tenant, reinitiate it and provide the correct tenant name. Editing anything downstream will not repoint an existing connection.

## Tenant in the .default scope

For a custom Microsoft Entra app, replace the `{{site_name}}` placeholder in `https://{{site_name}}.sharepoint.com/.default` with your SharePoint tenant name. The resulting `.default` scope requests the application permissions already configured and admin-consented for that SharePoint resource.

## Check what a connection resolved to

Fetch the connected account and inspect its stored state. Newer SDK responses expose the value under a shape such as `state.val.site_name`; older toolset responses expose `data.site_name`.
