---
type: reference
title: "Calendly"
description: "Customer-safe support knowledge for Calendly."
category: toolkits/calendly
visibility: public
timestamp: 2026-06-24T00:00:00Z
tags:
  - calendly
---
# Calendly

## Use CALENDLY_POST_INVITEE instead of deprecated CALENDLY_CREATE_EVENT_INVITEE

Use `CALENDLY_POST_INVITEE` for new Calendly invitee-creation flows. `CALENDLY_CREATE_EVENT_INVITEE` is deprecated, so migrate existing implementations to `CALENDLY_POST_INVITEE`.
