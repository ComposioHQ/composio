The TikTok toolkit's default scope set can include `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.list`, `video.upload`, and `video.publish`. If your own TikTok app is approved for only some of these, OAuth fails whenever the auth config falls back to the full default set.

Set an explicit scope list on the custom auth config containing only the permissions TikTok approved for that app, then reconnect.

## What this does and does not change

Existing tokens keep the grants they were issued with, so reconnecting is required for the new scope list to take effect.

Tools that depend on scopes you did not request stay unavailable. Profile detail, statistics, and video list tools such as `TIKTOK_GET_USER_STATS` and `TIKTOK_LIST_VIDEOS` need their corresponding scopes both approved by TikTok and requested in the auth config.
