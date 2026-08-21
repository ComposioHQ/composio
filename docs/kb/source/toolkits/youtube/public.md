---
type: "reference"
title: "YouTube"
description: "Public support knowledge for YouTube."
category: "auth-config"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "youtube"
---
# YouTube


## `YOUTUBE_UPLOAD_VIDEO` with `videoFilePath` is SDK-oriented and expects a full file path

`YOUTUBE_UPLOAD_VIDEO` is intended to be used through the SDK because it accepts `videoFilePath`. Pass a full local file path string such as `/path/to/video.mp4`, and use the latest toolkit version when debugging older upload failures.

## Use direct file paths or the current multipart upload action for YouTube videos

For YouTube video uploads, pass a local file path through SDK automatic file handling or use `YOUTUBE_MULTIPART_UPLOAD_VIDEO` when its single-request upload shape fits the file. Do not quote the old 50 MB staged-file limit without checking the current upload path and platform limit.

## Diagnose YouTube `processing abandoned` from the current upload and provider state

If YouTube returns `processing abandoned`, first check YouTube Studio/provider status, the video format, and the current toolkit version. Use a fresh execution log to distinguish provider processing failure from an upload-transfer failure.

## YouTube caption download requires `https://www.googleapis.com/auth/youtube.force-ssl`

For YouTube caption download, verify the connected account includes `https://www.googleapis.com/auth/youtube.force-ssl`. The scope was described as part of the default YouTube scope set, but the actual connection should still be checked from connection details when a tool call fails.

## YouTube has trigger support, but trigger creation errors may only surface at trigger setup time

YouTube supports triggers. For `YOUTUBE_NEW_ACTIVITY_TRIGGER`, use the field descriptions to provide the correct channel ID; trigger creation may otherwise fail without a separate preflight warning.

## `uploadLimitExceeded` is a YouTube channel limit, not an OAuth-app quota

YouTube limits how many videos a channel can upload in a 24-hour period across
the website, mobile apps, and the YouTube API. If an upload returns
`uploadLimitExceeded` or YouTube shows **Daily upload limit reached**, wait 24
hours before retrying. Switching to a different OAuth app does not bypass the
channel limit. See YouTube's [common uploading errors](https://support.google.com/youtube/answer/10383400).
