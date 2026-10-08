---
type: "reference"
title: "Browser Tool"
description: "Public support knowledge for Browser Tool."
category: "toolkits-and-providers"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "browser_tool"
---
# Browser Tool


## Browser Tool profiles do not work in Zero Data Retention projects

Browser Tool requires persistent browser profiles to maintain session state, so it is incompatible with projects configured for Zero Data Retention or removal of execution data. Move the Browser Tool usage to a project without ZDR enabled, or change the project's log/data visibility setting from removing execution data to storing/showing all logs where policy allows. The dashboard path is Project Settings / Log storage configuration, and the API setting is `log_visibility_setting: show_all`.
