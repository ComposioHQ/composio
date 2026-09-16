---
type: "reference"
title: "Wrike"
description: "Public support knowledge for Wrike."
category: "authentication"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "wrike"
---
# Wrike


## Use the Wrike user id, not the account id, when assigning or updating task users

For Wrike task update or assignment fields, pass the Wrike user `id` value rather than the `accountId`. Wrike validates the user identifier shown in the user object, not the account identifier.

## Wrike task responses expose multiple user-id fields and can resolve names

Wrike task data can contain several user-id fields, including `authorIds`, `responsibleIds`, `sharedIds`, and `followerIds`. For fetch-task results, use the `resolve_user_names` parameter, which is enabled by default, to return those ids along with their names. If identifying the creator specifically, check `authorIds`.

## Assignee is not a native field in Wrike fetch-task API responses

Do not expect a separate `assignee` field from the Wrike tasks API or the corresponding fetch-tasks tool. Wrike represents user relationships through id arrays such as responsible/user fields instead of a top-level `assignee` field.

## Use the Composio proxy endpoint or SDK executeRequest for direct Wrike API calls

For direct Wrike API calls through an existing Composio connected account, call the Composio proxy endpoint with the Wrike path and method, for example `endpoint: "/tasks"`, `method: "GET"`, and the `connected_account_id`. In SDK code, the same pattern can be done with `toolset.client.actions.executeRequest({ connectedAccountId, endpoint: "/tasks", method: "GET", parameters: [] })`. Ensure endpoint values are quoted strings.

## Pass entityId as a string when getConnections returns 404 in v3 SDK flows

When using v3 SDK connection APIs, pass the `entityId` as a string. If the code stores the value as `enterpriseId`, pass it through the SDK entity helper, for example `.getEntity("enterpriseId")`. Also use a current v3 SDK package rather than an older release candidate.

## Use the latest Wrike toolkit version for nested folder pagination

For Wrike folder APIs, avoid the base `00000000_00` toolkit version when dealing with nested folders. Retry with `latest` so the request uses the current nested-folder pagination behavior.
