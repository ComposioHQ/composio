## Can Attio auth config names carry a reference ID?


Composio does not support arbitrary custom metadata on auth configs. As a workaround, set a meaningful authConfig name when creating it, such as a company name or reference ID, and use that name for identification.

## Missing Attio OAuth scopes


First confirm whether the user is using Composio's managed OAuth app or their own Attio OAuth app. If the managed app does not include the required Attio scopes, use the user's own Attio OAuth app where those scopes are configured and approved.

## Attio OAuth tokens cannot be programmatically revoked by Composio


Attio is in the group of providers where Composio cannot programmatically revoke OAuth tokens because the provider does not offer a revocation API for that flow. For Attio, instruct end users to remove the connection manually in the provider's app settings, then re-authorize as needed.
