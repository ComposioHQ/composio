## How do I set up custom Google OAuth credentials for YouTube?

For a step-by-step guide on creating and configuring your own Google OAuth credentials with Composio, see [How to create OAuth2 credentials for Google Apps](https://composio.dev/auth/googleapps).

## Why am I getting quota errors on YouTube?

The default OAuth app is shared and has strict quota limits. For production, create your own OAuth app to get a dedicated quota.

---

## When should I use a custom YouTube OAuth app in production to avoid shared default-app quota limits?

YouTube enforces strict API quotas. When users use Composio's default YouTube OAuth app, that quota can be shared across users, so production workloads should use the user's own Google Cloud OAuth app and create the YouTube auth config with those credentials. This gives the user independent quota control and avoids being blocked by shared managed-app limits.

## What does `YOUTUBE_UPLOAD_VIDEO` with `videoFilePath` mean?

`YOUTUBE_UPLOAD_VIDEO` is intended to be used through the SDK because it accepts `videoFilePath`. Pass a full local file path string such as `/path/to/video.mp4`, and use the latest toolkit version when troubleshooting older upload failures.

## When should I use direct file paths or multipart upload for YouTube videos; `FileUploadable`/S3 has a 50 MB limit?

For YouTube video uploads, prefer passing a local file path through SDK automatic file handling. `FileUploadable` objects go through Composio S3 and may be too small for many videos. If `YOUTUBE_MULTIPART_UPLOAD_VIDEO` is available in the current toolkit version, use that path for larger uploads.

## How should I handle youTube `processing abandoned` can be provider-side, but upload byte-transfer bugs should be checked separately?

If YouTube returns `processing abandoned`, first reproduce against the official YouTube API to distinguish provider behavior from a Composio tool bug. One investigated failure found that resumable upload must send raw bytes in the PUT request; multipart/form-data wrapping can create the video resource but fail to transfer usable video bytes.

## What does YouTube caption download require?

For YouTube caption download, verify the connected account includes `https://www.googleapis.com/auth/youtube.force-ssl`. The scope was described as part of the default YouTube scope set, but the actual connection should still be checked from connection details when a tool call fails.
