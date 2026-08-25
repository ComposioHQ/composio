---
type: "reference"
title: "ClickUp"
description: "Public support knowledge for ClickUp."
category: "auth-config"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "clickup"
---
# ClickUp


## ClickUp uses customer-owned OAuth or API-key credentials

Create the ClickUp auth config with the customer's OAuth app or API-key
credentials. In newer SDK/API flows, use the v3 auth config nano ID (`ac_...`)
rather than older v1/v2 integration assumptions.

## ClickUp custom OAuth should use the Composio callback URL registered in the ClickUp app

For ClickUp custom OAuth, make sure the redirect URL in the ClickUp app matches the callback shown by the current Composio auth-config flow. A mismatch between the current auth config and an old callback copied from a legacy SDK example is a common cause of setup failure.

## ClickUp folders and tasks are supported through `CLICKUP_GET_FOLDERS` and `CLICKUP_GET_TASKS`

For ClickUp folder/task-list workflows, use supported tools such as `CLICKUP_GET_FOLDERS` and `CLICKUP_GET_TASKS`. If a more specific ClickUp endpoint is missing, route it as a tool request.
