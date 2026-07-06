## Browser Tool profiles do not work in Zero Data Retention projects

If a Browser Tool task returns `403 - Profiles are not available for Zero Data Retention projects`, the task failed while creating or using the persistent browser profile required for the session.

Browser profiles are the saved browser environment behind logged-in or stateful browser automation. They can include cookies, local storage, session data, and other browser state needed to keep the same website session across actions. Zero Data Retention or no-execution-data settings can prevent that profile state from being stored.

This is not an OAuth reconnect, Browser Tool version, or website credential issue. Use Browser Tool from a project or environment where your data-retention policy allows browser profile state to be stored. If the project already allows retained execution data and the error continues, share the tool execution log ID with support so the profile-creation path can be checked.
