---
type: reference
title: "Canva"
description: "Customer-safe support knowledge for Canva."
category: toolkits/canva
visibility: public
timestamp: 2026-06-24T00:00:00Z
tags:
  - canva
---
# Canva

## Use Canva autofill jobs when content must be populated into a design

Use `CANVA_INITIATE_CANVA_DESIGN_AUTOFILL_JOB` when a Canva workflow must insert content into a generated design. The autofill workflow accepts a brand template and its input data, then creates the populated design asynchronously.

`CANVA_CREATE_CANVA_DESIGN_WITH_OPTIONAL_ASSET` is deprecated in favor of `CANVA_POST_DESIGNS`, but both create-design flows create a blank design by default and do not accept arbitrary design content. Use `CANVA_POST_DESIGNS` only when a blank design is the intended result.
