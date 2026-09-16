---
type: "troubleshooting"
title: "Linear"
description: "Public trigger configuration guidance for Linear."
category: "toolkits-and-providers"
visibility: "public"
timestamp: "2026-07-24T00:00:00Z"
tags:
  - "linear"
  - "triggers"
  - "team_id"
---
# Linear

## Linear triggers require a valid `team_id`

`team_id` is required for Linear triggers. An invalid-input error during trigger or webhook creation usually means the supplied team ID is missing or invalid.

Use `LINEAR_LIST_LINEAR_TEAMS` to retrieve valid team IDs, then pass the selected team ID into the trigger configuration.
