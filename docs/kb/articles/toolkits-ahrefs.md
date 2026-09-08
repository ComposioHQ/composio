## Ahrefs actions must call api.ahrefs.com, not ahrefs.com

Ahrefs API calls should use the API host https://api.ahrefs.com/v3. If Ahrefs actions or connection checks are hitting https://ahrefs.com/v3 and returning 404 HTML, treat it as a connector base-URL configuration problem rather than an API-key or request-payload issue. Confirm the failing request is using api.ahrefs.com; if it is not, contact Composio support with the redacted request or log ID for connector review.
