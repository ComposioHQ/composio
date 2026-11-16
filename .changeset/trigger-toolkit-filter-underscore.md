---
'@composio/core': patch
---

Match the `toolkits` filter of `triggers.subscribe()` for toolkits whose slug contains an underscore

The toolkit of an incoming event is derived from the first `_` segment of its trigger slug, so `ONE_DRIVE_FILE_CREATED_TRIGGER` was attributed to `ONE` and `subscribe(fn, { toolkits: ['one_drive'] })` dropped every OneDrive event. The same happened to `launch_darkly` and `agent_mail`. A `toolkits` entry now also matches when the trigger slug starts with `<toolkit>_`.
