---
type: "reference"
title: "Ahrefs"
description: "Public support knowledge for Ahrefs."
category: "toolkits-and-providers"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "ahrefs"
---
# Ahrefs


## Ahrefs actions must call api.ahrefs.com, not ahrefs.com

Ahrefs API calls should use the API host https://api.ahrefs.com/v3. If Ahrefs actions or connection checks are hitting https://ahrefs.com/v3 and returning 404 HTML, treat it as a connector base-URL configuration problem rather than a customer-side API-key or request-payload issue. Confirm the failing request is using api.ahrefs.com; if it is not, route the case to a human for connector review.
