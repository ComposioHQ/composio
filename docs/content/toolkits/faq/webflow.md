## How do I create or update Webflow collection items with the draft/live flag?

Use `WEBFLOW_CREATE_COLLECTION_ITEM` to create a collection item and set whether it is draft or live with the `is_draft` parameter. Use `WEBFLOW_UPDATE_COLLECTION_ITEM` to update an existing item. If the user specifically needs Webflow v2's dedicated individual collection-item publish/live endpoints, treat that as separate publish-collection-item support rather than the basic create/update flow.

## When should I use the current Webflow toolkit version for recently added page tools?

When a recently added Webflow tool such as `WEBFLOW_GET_PAGE` is not found through the API, pass the toolkit/tool version explicitly. The default version can be older than the newest available Webflow toolkit version. Use the latest Webflow toolkit version shown by Composio for API calls that need newly added tools.

## When should I use a custom Webflow OAuth app when the default app cannot authorize workspaces?

If Webflow's consent screen does not let the user select a workspace/site or the authorize button is greyed out with the default OAuth app, use the user's own Webflow OAuth app credentials so the workspace authorization is controlled by their Webflow app.

## Deprecated Webflow v1 endpoints caused publish-site integration failures

If Webflow calls fail because the integration is using unsupported or deprecated endpoints, check whether the failing action is an older v1 Webflow tool. Prefer current Webflow toolkit versions and avoid older deprecated v1 Webflow tools where possible.
