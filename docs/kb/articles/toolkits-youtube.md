Use this guide to upload YouTube videos, configure scopes and triggers, and distinguish upload failures from provider limits.

## Upload videos through current YouTube actions

**Use a full file path with `YOUTUBE_UPLOAD_VIDEO`.** `YOUTUBE_UPLOAD_VIDEO` is intended to be used through the SDK because it accepts `videoFilePath`. Pass a full local file path string such as `/path/to/video.mp4`, and use the latest toolkit version when debugging older upload failures.

**Choose the current upload path for the file.** For YouTube video uploads, pass a local file path through SDK automatic file handling or use `YOUTUBE_MULTIPART_UPLOAD_VIDEO` when its single-request upload shape fits the file. Do not quote the old 50 MB staged-file limit without checking the current upload path and platform limit.

## Troubleshoot YouTube processing and provider limits

**Inspect current execution and provider state for `processing abandoned`.** If YouTube returns `processing abandoned`, first check YouTube Studio/provider status, the video format, and the current toolkit version. Use a fresh execution log to distinguish provider processing failure from an upload-transfer failure.

**Treat `uploadLimitExceeded` as a channel limit.** YouTube limits how many videos a channel can upload in a 24-hour period across the website, mobile apps, and the YouTube API. If an upload returns `uploadLimitExceeded` or YouTube shows **Daily upload limit reached**, wait 24 hours before retrying. Switching to a different OAuth app does not bypass the channel limit. See YouTube's [common uploading errors](https://support.google.com/youtube/answer/10383400).

## Configure YouTube scopes and triggers

**Include the caption-download scope.** For YouTube caption download, verify the connected account includes `https://www.googleapis.com/auth/youtube.force-ssl`. The scope was described as part of the default YouTube scope set, but the actual connection should still be checked from connection details when a tool call fails.

**Validate the channel ID when creating a trigger.** YouTube supports triggers. For `YOUTUBE_NEW_ACTIVITY_TRIGGER`, use the field descriptions to provide the correct channel ID; trigger creation may otherwise fail without a separate preflight warning.
