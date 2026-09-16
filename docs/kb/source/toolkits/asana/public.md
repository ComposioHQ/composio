---
type: "reference"
title: "Asana"
description: "Public support knowledge for Asana."
category: "authentication"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "asana"
---
# Asana


## Use `ASANA_GET_STORIES_FOR_TASK` and pass the task ID as a string

Asana represents task comments as stories. Use `ASANA_GET_STORIES_FOR_TASK` to retrieve the comments and activity for a task, and pass the task ID as a string rather than an integer. For custom toolkit-based tools, set the Asana base URL to `https://app.asana.com/api/1.0` and include the required Authorization header.

## Use the current Asana task triggers

The current Asana toolkit exposes triggers for task creation, updates, comments, attachments, tags, and moves between sections. Fetch the trigger catalog before implementation and use the exact returned slug, such as `ASANA_TASK_COMMENT_ADDED` or `ASANA_TASK_UPDATED`.
