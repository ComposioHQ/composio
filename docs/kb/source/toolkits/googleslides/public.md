---
type: "reference"
title: "Google Slides"
description: "Public support knowledge for Google Slides."
category: "auth-config"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "googleslides"
---
# Google Slides


## Use Google Drive search to list or discover Google Slides presentations

Google Slides does not offer a dedicated endpoint to list all presentations through the Slides toolkit. Use `GOOGLEDRIVE_FIND_FILE` and filter Drive files with `q`, for example `mimeType = 'application/vnd.google-apps.presentation'`, then pass the returned presentation ID into the Google Slides tool.

## `GOOGLESLIDES_PRESENTATIONS_GET` needs the presentation ID from the URL or Drive payload

`GOOGLESLIDES_PRESENTATIONS_GET` should be called with the Google Slides presentation ID. Get that ID from the presentation URL, or use the ID returned by `GOOGLEDRIVE_FIND_FILE` when discovering presentations through Drive.

## Use the same Google account when pairing Drive discovery with Google Slides reads

When a workflow discovers presentations with `GOOGLEDRIVE_FIND_FILE` and then reads them with `GOOGLESLIDES_PRESENTATIONS_GET`, make sure the connected Google Drive and Google Slides accounts are the same account. Otherwise the ID may be valid in Drive discovery but inaccessible to the Slides connection.

## Google Slide creation tools are available through Google Super

Google Slide creation tools were added to the Google Super toolkit. For slide creation workflows, use the relevant Google Super tools rather than trying to create a native Slides file through generic Drive text upload.

## Custom Google Slides OAuth apps must be verified for sensitive scopes

When using a custom Google developer app for Google Slides, the app must be verified for the sensitive Google scopes it requests. Without verification, Google may block or warn on the OAuth consent flow.

## Google Slides supports one trigger in Composio

Google Slides is listed as a trigger-capable toolkit in Composio with one supported trigger.
