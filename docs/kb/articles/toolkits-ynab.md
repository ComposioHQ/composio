## YNAB supports managed and customer-owned OAuth

Use Composio-managed OAuth for the standard connection flow. Create a custom
auth config with the customer's YNAB client ID and client secret when they need
control over the provider app. For custom OAuth, register the exact redirect URI
shown by the current Composio auth-config flow.

If YNAB reports that an application is restricted, review the YNAB app's
current review and access-token restrictions. An app intended only for its
owner and an app distributed to unrelated users can have different provider
review requirements. Do not promise a provider approval date.
