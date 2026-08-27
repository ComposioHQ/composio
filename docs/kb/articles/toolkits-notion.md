Use this guide to choose current Notion tools and triggers, understand integration access, and troubleshoot connection or response-size issues.

## Use current Notion tools and triggers

**Retrieve pages with the current tool slug.** `NOTION_GET_PAGE` is not the current valid slug. Use `NOTION_RETRIEVE_PAGE`, and verify available Notion tools from the marketplace/tool listing.

**Fetch Notion data with the current tool slug.** `NOTION_FETCH_NOTION_DATA` is not valid. Use `NOTION_FETCH_DATA` instead.

**Choose the trigger that matches the Notion event.** The current Notion catalog includes separate triggers for page creation, page content updates, page property updates, and data-source schema updates. Choose the trigger that matches the event rather than expecting a page-created trigger to fire for edits. Fetch the current trigger catalog before implementation and use the exact returned slug.

## Configure Notion access and connected accounts

**Grant page and database access through the Notion integration.** Notion does not model access as normal OAuth scopes. Page/database access is granted per Notion integration/OAuth client ID through Notion “Capabilities” and workspace grants. If multiple Composio auth configs use the same underlying Notion integration, page authorization can overlap.

**Treat auth config selection as connection lookup behavior.** Existing connected accounts under a different auth config continue to refresh and work. Specifying an auth config affects which connection get/use functions look for; it does not rewrite refresh behavior for already-valid connected accounts.

## Troubleshoot Notion connections and large responses

**Check for a revoked integration when Notion returns 401 or refresh fails.** A Notion refresh failure with “Invalid refresh token” is usually a token revocation issue. Common causes are the user disconnecting the integration in Notion settings or a workspace admin removing/blocking the integration.

**Keep Notion responses focused.** Large response payloads and overly complex structures can degrade agent behavior. Prefer narrower fetches/filters where available and track product improvements for simpler response structures.
