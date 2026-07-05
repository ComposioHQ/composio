## How do I set up custom Google OAuth credentials for YouTube?


For a step-by-step guide on creating and configuring your own Google OAuth credentials with Composio, see [How to create OAuth2 credentials for Google Apps](https://composio.dev/auth/googleapps).

## Why am I getting quota errors on YouTube?


The default OAuth app is shared and has strict quota limits. For production, create your own OAuth app to get a dedicated quota.

---

## When should I use a custom YouTube OAuth app in production to avoid shared default-app quota limits?


YouTube enforces strict API quotas. When users use Composio's default YouTube OAuth app, that quota can be shared across users, so production workloads should use the user's own Google Cloud OAuth app and create the YouTube auth config with those credentials. This gives the user independent quota control and avoids being blocked by shared managed-app limits.

![YouTube auth config form showing the option to use custom developer credentials.](/images/kb/toolkits/youtube/youtube-custom-oauth-auth-config.png)

## What can cause YouTube `processing abandoned` after upload?


YouTube can return `processing abandoned` when the video resource exists but uploaded bytes are not usable. For resumable uploads, YouTube expects raw bytes in the PUT request. Avoid multipart/form-data wrapping for the resumable byte-transfer step.

## What is required for YouTube caption download?


For YouTube caption download, verify the connected account includes `https://www.googleapis.com/auth/youtube.force-ssl`. If a caption download tool call fails, check the connection details to confirm the scope was granted.

## How do I configure the YouTube new activity trigger?


`YOUTUBE_NEW_ACTIVITY_TRIGGER` requires `channel_id`. Provide the YouTube channel ID for the channel you want to watch. If an `interval` field is exposed, it controls the polling interval for checking new activity. Validation happens during trigger creation/upsert, so check the trigger creation response if setup fails.

![YouTube New Activity trigger configuration showing the required channel_id field.](/images/kb/toolkits/youtube/youtube-new-activity-trigger-channel-id.png)
