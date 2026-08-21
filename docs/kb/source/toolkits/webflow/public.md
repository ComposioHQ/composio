---
type: "reference"
title: "Webflow"
description: "Public support knowledge for Webflow."
category: "toolkits-and-providers"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "webflow"
---
# Webflow


## Create or update Webflow collection items with the draft/live flag

Use `WEBFLOW_CREATE_COLLECTION_ITEM` to create a collection item and set whether it is draft or live with the `is_draft` parameter. Use `WEBFLOW_UPDATE_COLLECTION_ITEM_V2` to update an existing item. If the customer specifically needs Webflow v2's dedicated individual collection-item publish/live endpoints, treat that as separate publish-collection-item support rather than the basic create/update flow. The older `WEBFLOW_UPDATE_COLLECTION_ITEM` action is deprecated.

## Use the current Webflow toolkit version for recently added page tools

When a recently added Webflow tool such as `WEBFLOW_GET_PAGE` is not found through the API, pass the toolkit/tool version explicitly. The base version `00000000_00` can be older than a dated release. Use the latest Webflow toolkit version shown by Composio for API calls that need newly added tools.

## Deprecated Webflow v1 endpoints caused publish-site integration failures

If Webflow calls fail because the integration is using unsupported or deprecated endpoints, check whether the failing action is an older v1 Webflow tool. Use the current `WEBFLOW_PUBLISH_SITE` action and current toolkit version; if the failure persists, share the failed tool-call log ID with Composio support.
