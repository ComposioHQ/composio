---
type: "reference"
title: "Calendly"
description: "Public support knowledge for Calendly."
category: "toolkits-and-providers"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "calendly"
---
# Calendly


## Use CALENDLY_POST_INVITEE instead of deprecated CALENDLY_CREATE_EVENT_INVITEE

For Calendly invitee creation flows, prefer `CALENDLY_POST_INVITEE` instead of the legacy `CALENDLY_CREATE_EVENT_INVITEE`. New implementations and migration guidance should point customers to `CALENDLY_POST_INVITEE`.
