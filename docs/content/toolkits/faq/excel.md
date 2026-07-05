## Excel support for OAuth2 client credentials may vary by action

Excel OAuth2 client-credentials behavior can vary by action because some underlying Microsoft APIs require user-delegated tokens. If an Excel action fails with an application-only token, retry with a delegated OAuth connection or verify that Microsoft supports application permissions for that endpoint.

## Which auth guide should I use for Excel?

For Excel auth setup, use the Microsoft auth guide published at https://composio.dev/auth/outlook. The same guide was referenced for SharePoint, Microsoft Teams, Outlook, and Excel.
