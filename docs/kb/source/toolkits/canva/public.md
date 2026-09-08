---
type: "reference"
title: "Canva"
description: "Public support knowledge for Canva."
category: "toolkits-and-providers"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "canva"
---
# Canva


## Use Canva autofill jobs when content must be populated into a design

For Canva workflows that need content inserted into a generated design, do not rely on the create-design endpoint/tool. `CANVA_CREATE_CANVA_DESIGN_WITH_OPTIONAL_ASSET` is deprecated and should be replaced with `CANVA_POST_DESIGNS`, but both the old and new create-design flows create a blank design by default and do not accept arbitrary content in the request. Use `CANVA_INITIATE_CANVA_DESIGN_AUTOFILL_JOB` for the content-population use case, because that flow is built around Canva's autofill capability.
