---
'@composio/python-sdk': patch
---

Match the `toolkit` filter of trigger subscriptions for toolkits whose slug contains an underscore

The toolkit of an incoming event is derived from the first `_` segment of its trigger slug, so `ONE_DRIVE_FILE_CREATED_TRIGGER` was attributed to `ONE` and `handle(toolkit="one_drive")` skipped every OneDrive event. The same happened to `launch_darkly` and `agent_mail`. A `toolkit` filter now also matches when the trigger slug starts with `<toolkit>_`.
